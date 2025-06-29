import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import prisma from '@/db';

interface AuthenticatedSocket {
  userId: string;
  deviceId: string;
  sessionId: string;
  handle: string;
}

interface WebSocketMessage {
  type: 'message' | 'typing' | 'heartbeat' | 'auth';
  data: any;
  timestamp: number;
}

interface EncryptedMessageData {
  receiverHandle: string;
  content: string;
  messageType?: string;
  tempId?: string;
  encrypted?: boolean;
  encryptedData?: string;
  pfsMessage?: boolean;
}

class WebSocketManager {
  private connections = new Map<string, any>(); // userId -> socket
  private userSessions = new Map<string, AuthenticatedSocket>(); // socketId -> user data

  addConnection(userId: string, socket: any, sessionData: AuthenticatedSocket) {
    // Remove existing connection for this user (single device policy)
    if (this.connections.has(userId)) {
      const oldSocket = this.connections.get(userId);
      oldSocket.close();
    }

    this.connections.set(userId, socket);
    this.userSessions.set(socket.id || socket._id || Math.random().toString(), sessionData);
    logger.info(`WebSocket connected for user ${sessionData.handle}`);
  }

  removeConnection(userId: string) {
    this.connections.delete(userId);
    logger.info(`WebSocket disconnected for user ${userId}`);
  }

  getConnection(userId: string) {
    return this.connections.get(userId);
  }

  broadcastToUser(userId: string, message: any) {
    const socket = this.connections.get(userId);
    if (socket) {
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  getConnectedUsers(): string[] {
    return Array.from(this.connections.keys());
  }

  async broadcastToContacts(userId: string, message: any) {
    const contacts = await prisma.contact.findMany({
      where: {
        userId: userId,
        isBlocked: false,
      },
      select: {
        contactId: true,
      },
    });

    const contactIds = contacts.map((c) => c.contactId);

    contactIds.forEach((contactId) => {
      this.broadcastToUser(contactId, message);
    });
  }

  broadcast(message: WebSocketMessage) {
    this.connections.forEach(socket => {
      socket.send(JSON.stringify(message));
    });
  }
}

const wsManager = new WebSocketManager();

export function setupWebSocket(fastify: FastifyInstance) {
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, async (connection, _request) => {
      const socket = connection.socket;
      let authenticatedUser: AuthenticatedSocket | null = null;
      logger.info('WebSocket connection established.');

      // Handle authentication
      socket.on('message', async (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          logger.info(`Received WebSocket message: ${JSON.stringify(message, null, 2)}`);

          // First message must be authentication
          if (!authenticatedUser && message.type !== 'auth') {
            socket.send(JSON.stringify({
              type: 'error',
              data: { message: 'Authentication required' },
              timestamp: Date.now()
            }));
            socket.close();
            return;
          }

          // Handle authentication
          if (message.type === 'auth') {
            const { token, sessionId } = message.data;
            logger.info(`Attempting authentication with token: ${token} and sessionId: ${sessionId}`);

            try {
              // Verify JWT token
              const decoded = jwt.verify(token, config.JWT_SECRET) as any;
              logger.info(`JWT decoded: ${JSON.stringify(decoded, null, 2)}`);
              
              // Validate session
              const session = await prisma.session.findUnique({
                where: {
                  id: sessionId,
                  isActive: true,
                  expiresAt: { gt: new Date() }
                },
                include: {
                  user: {
                    select: { id: true, handle: true }
                  },
                  device: {
                    select: { deviceId: true }
                  }
                }
              });

              if (!session) {
                logger.error(`Session not found or invalid for sessionId: ${sessionId}`);
                throw new Error('Invalid session');
              }

              if (session.userId !== decoded.userId) {
                logger.error(`Session userId (${session.userId}) does not match decoded userId (${decoded.userId})`);
                throw new Error('Invalid session');
              }

              logger.info(`Session validation successful for user: ${session.user.handle}`);

              // Update session heartbeat
              await prisma.session.update({
                where: { id: sessionId },
                data: { lastHeartbeat: new Date() }
              });

              authenticatedUser = {
                userId: session.userId,
                deviceId: session.device.deviceId,
                sessionId: session.id,
                handle: session.user.handle
              };

              wsManager.addConnection(session.userId, socket, authenticatedUser);

              socket.send(JSON.stringify({
                type: 'auth_success',
                data: { 
                  handle: session.user.handle,
                  userId: session.userId,
                },
                timestamp: Date.now()
              }));
              logger.info(`Sent auth_success to ${session.user.handle}`);
              
              // Deliver any offline messages
              await deliverOfflineMessages(session.userId);

              return;

            } catch (error) {
              logger.error('WebSocket authentication failed:', error);
              socket.send(JSON.stringify({
                type: 'auth_error',
                data: { message: 'Authentication failed' },
                timestamp: Date.now()
              }));
              socket.close();
              return;
            }
          }

          // Handle authenticated messages
          if (authenticatedUser) {
            await handleAuthenticatedMessage(message, authenticatedUser, socket);
          }

        } catch (error) {
          logger.error('WebSocket message error:', error);
          socket.send(JSON.stringify({
            type: 'error',
            data: { message: 'Invalid message format' },
            timestamp: Date.now()
          }));
        }
      });

      socket.on('close', () => {
        if (authenticatedUser) {
          wsManager.removeConnection(authenticatedUser.userId);
          logger.info(`WebSocket connection closed for user ${authenticatedUser.handle}`);
        }
      });

      socket.on('error', (error) => {
        logger.error('WebSocket error:', error);
        if (authenticatedUser) {
          wsManager.removeConnection(authenticatedUser.userId);
        }
      });
    });
  });
}

async function handleAuthenticatedMessage(
  message: WebSocketMessage,
  user: AuthenticatedSocket,
  socket: any
) {
  switch (message.type) {
    case 'message':
      await handleMessageSend(message, user);
      break;
      
    case 'typing':
      await handleTypingIndicator(message, user);
      break;
      
    case 'heartbeat':
      await handleHeartbeat(user, socket);
      break;
  }
}

async function handleMessageSend(message: WebSocketMessage, sender: AuthenticatedSocket) {
  const { receiverHandle, messageType = 'text', tempId, encrypted, encryptedData, pfsMessage } = message.data as EncryptedMessageData;

  try {
    // ENFORCE E2EE: Reject all unencrypted messages
    if (!encrypted || !encryptedData) {
      logger.warn(`Rejected unencrypted message from ${sender.handle} to ${receiverHandle}`);
      return; // Silently reject unencrypted messages
    }

    // Find receiver
    const receiver = await prisma.user.findUnique({
      where: { handle: receiverHandle },
      select: { id: true, handle: true }
    });

    if (!receiver) {
      return;
    }

    // Check if they are contacts
    const contact = await prisma.contact.findUnique({
      where: {
        userId_contactId: {
          userId: sender.userId,
          contactId: receiver.id
        }
      }
    });

    if (!contact || contact.isBlocked) {
      return;
    }

    // Store ONLY encrypted messages in database
    const dbMessage = await prisma.message.create({
      data: {
        senderId: sender.userId,
        receiverId: receiver.id,
        senderDeviceId: sender.deviceId,
        receiverDeviceId: sender.deviceId,
        content: '[Encrypted Message]', // Never store plaintext
        messageType,
        delivered: false,
        read: false,
        // Always store encrypted data in metadata
        metadata: JSON.stringify({ 
          encrypted: true, 
          encryptedData: encryptedData,
          pfsMessage: pfsMessage || false
        })
      }
    });

    // Prepare message for delivery
    const messagePayload = {
      id: dbMessage.id,
      content: dbMessage.content,
      messageType: dbMessage.messageType,
      senderHandle: sender.handle,
      senderId: sender.userId,
      timestamp: dbMessage.timestamp.getTime(),
      encrypted: encrypted || false,
      encryptedData: encryptedData || undefined,
      pfsMessage: pfsMessage || false
    };

    // Send to receiver if online
    const delivered = wsManager.broadcastToUser(receiver.id, {
      type: 'message',
      data: messagePayload,
      timestamp: Date.now()
    });

    // Update delivery status
    if (delivered) {
      await prisma.message.update({
        where: { id: dbMessage.id },
        data: { delivered: true, deliveredAt: new Date() }
      });
    }

    // Send confirmation to sender
    const senderSocket = wsManager.getConnection(sender.userId);
    if (senderSocket) {
      senderSocket.send(JSON.stringify({
        type: 'message_sent',
        data: {
          tempId,
          id: dbMessage.id,
          delivered,
          timestamp: dbMessage.timestamp.getTime()
        },
        timestamp: Date.now()
      }));
    }

  } catch (error) {
    logger.error('Failed to send message:', error);
  }
}

async function handleTypingIndicator(message: WebSocketMessage, sender: AuthenticatedSocket) {
  try {
    const { receiverHandle, isTyping } = message.data;

    const recipient = await prisma.user.findUnique({
      where: { handle: receiverHandle },
      select: { id: true }
    });

    if (!recipient) {
      return; // Recipient not found
    }

    wsManager.broadcastToUser(recipient.id, {
      type: 'typing',
      data: { senderId: sender.userId, isTyping },
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Failed to handle typing indicator:', error);
  }
}

async function handleHeartbeat(user: AuthenticatedSocket, socket: any) {
  try {
    // Update session heartbeat
    await prisma.session.update({
      where: { id: user.sessionId },
      data: { lastHeartbeat: new Date() }
    });

    socket.send(JSON.stringify({
      type: 'heartbeat_ack',
      data: { status: 'ok' },
      timestamp: Date.now()
    }));

  } catch (error) {
    logger.error('Heartbeat error:', error);
  }
}

async function deliverOfflineMessages(userId: string) {
  try {
    const offlineMessages = await prisma.message.findMany({
      where: {
        receiverId: userId,
        deliveredAt: null,
      },
      include: {
        sender: {
          select: { id: true, handle: true },
        },
      },
    });

    if (offlineMessages.length > 0) {
      logger.info(`Found ${offlineMessages.length} offline messages for user ${userId}.`);
    }

    for (const message of offlineMessages) {
      // Parse metadata to get encryption details
      let encryptedData, pfsMessage = false;
      try {
        if (message.metadata) {
          const metadata = JSON.parse(message.metadata as string);
          encryptedData = metadata.encryptedData;
          pfsMessage = metadata.pfsMessage || false;
        }
      } catch (metadataError) {
        logger.warn(`Failed to parse metadata for message ${message.id}`);
      }

      // 1. Deliver the message to the recipient
      const delivered = wsManager.broadcastToUser(userId, {
        type: 'message',
        data: {
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          senderHandle: message.sender.handle,
          timestamp: message.timestamp.toISOString(),
          encrypted: !!encryptedData,
          encryptedData: encryptedData,
          pfsMessage: pfsMessage
        },
        timestamp: Date.now(),
      });

      if (delivered) {
        // 2. Mark as delivered in DB
        await prisma.message.update({
          where: { id: message.id },
          data: { deliveredAt: new Date() },
        });

        // 3. Notify the original sender
        wsManager.broadcastToUser(message.senderId, {
          type: 'delivery_receipt',
          data: { messageId: message.id },
          timestamp: Date.now(),
        });
        logger.info(`Sent delivery_receipt for message ${message.id} to sender ${message.sender.handle}`);
      }
    }
  } catch (error) {
    logger.error(`Error delivering offline messages for user ${userId}:`, error);
  }
}

export { wsManager }; 