import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import prisma from '@/db';

// Validation schemas - Updated to enforce E2EE
const sendMessageSchema = z.object({
  receiverHandle: z.string(),
  content: z.string().min(1), // This should be "[Encrypted Message]" for E2EE
  messageType: z.string().default('TEXT'),
  replyToId: z.string().optional(),
  metadata: z.string().optional(),
  encrypted: z.boolean().refine((val) => val === true, {
    message: "Only encrypted messages are allowed"
  }),
  encryptedData: z.string().min(1, "Encrypted data is required"),
});

const getMessagesSchema = z.object({
  contactHandle: z.string(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export const sendMessage = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const body = sendMessageSchema.parse(request.body);
    const userId = request.user!.userId;
    const deviceId = request.user!.deviceId;

    // Find the receiver
    const receiver = await prisma.user.findUnique({
      where: { handle: body.receiverHandle },
      select: { id: true, handle: true }
    });

    if (!receiver) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Receiver not found'
      });
    }

    if (receiver.id === userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot send message to yourself'
      });
    }

    // Check if they are contacts
    const contact = await prisma.contact.findUnique({
      where: {
        userId_contactId: {
          userId,
          contactId: receiver.id
        }
      }
    });

    if (!contact || contact.isBlocked) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot send message to this user'
      });
    }

    // Create the message - enforcing E2EE
    const message = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId: receiver.id,
        senderDeviceId: deviceId,
        receiverDeviceId: deviceId, // For now, use same device
        content: '[Encrypted Message]', // Never store plaintext
        messageType: body.messageType,
        replyToId: body.replyToId,
        metadata: JSON.stringify({
          encrypted: true,
          encryptedData: body.encryptedData
        }),
      },
      include: {
        sender: {
          select: { handle: true }
        },
        receiver: {
          select: { handle: true }
        }
      }
    });

    logger.info(`Message sent from ${message.sender.handle} to ${message.receiver.handle}`);

    return reply.status(201).send({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: message.id,
        content: message.content,
        messageType: message.messageType,
        timestamp: message.timestamp,
        receiverHandle: message.receiver.handle,
        replyToId: message.replyToId,
      }
    });

  } catch (error) {
    logger.error('Send message error:', error);

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid input data',
        details: error.errors
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to send message'
    });
  }
};

export const getMessages = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const query = getMessagesSchema.parse(request.query);
    const userId = request.user!.userId;

    // Find the contact
    const contact = await prisma.user.findUnique({
      where: { handle: query.contactHandle },
      select: { id: true, handle: true }
    });

    if (!contact) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Contact not found'
      });
    }

    // Get messages between users
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          {
            senderId: userId,
            receiverId: contact.id
          },
          {
            senderId: contact.id,
            receiverId: userId
          }
        ]
      },
      include: {
        sender: {
          select: { handle: true }
        },
        receiver: {
          select: { handle: true }
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: { handle: true }
            }
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: query.limit,
      skip: query.offset,
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        senderId: contact.id,
        receiverId: userId,
        read: false
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });

    return reply.send({
      success: true,
      messages: messages.map((msg: any) => {
        const metadata = msg.metadata ? JSON.parse(msg.metadata) : null;
        return {
          id: msg.id,
          content: msg.content, // This should always be "[Encrypted Message]"
          messageType: msg.messageType,
          timestamp: msg.timestamp,
          senderHandle: msg.sender.handle,
          receiverHandle: msg.receiver.handle,
          delivered: msg.delivered,
          read: msg.read,
          replyTo: msg.replyTo ? {
            id: msg.replyTo.id,
            content: msg.replyTo.content, // This might also be encrypted
            senderHandle: msg.replyTo.sender.handle
          } : null,
          encrypted: metadata?.encrypted || false,
          encryptedData: metadata?.encryptedData || undefined
        };
      }).reverse()
    });

  } catch (error) {
    logger.error('Get messages error:', error);

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: error.errors
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to get messages'
    });
  }
};

export const markMessageDelivered = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const { messageId } = request.params as { messageId: string };
    const userId = request.user!.userId;

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        receiverId: userId
      }
    });

    if (!message) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Message not found'
      });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        delivered: true,
        deliveredAt: new Date()
      }
    });

    return reply.send({
      success: true,
      message: 'Message marked as delivered'
    });

  } catch (error) {
    logger.error('Mark delivered error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to mark message as delivered'
    });
  }
}; 