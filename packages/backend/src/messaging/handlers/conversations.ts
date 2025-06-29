import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/utils/logger';
import prisma from '@/db';

/**
 * Get conversations for current user
 */
export const getConversations = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const userId = request.user!.userId;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        sender: { select: { id: true, handle: true } },
        receiver: { select: { id: true, handle: true } },
      },
    });

    const conversationsMap = new Map<string, any>();

    for (const message of messages) {
      const contact = message.senderId === userId ? message.receiver : message.sender;
      if (conversationsMap.has(contact.id)) continue;

      const contactRelation = await prisma.contact.findFirst({
        where: {
          OR: [
            { userId: userId, contactId: contact.id },
            { userId: contact.id, contactId: userId },
          ],
        },
      });

      const unreadCount = await prisma.message.count({
        where: {
          senderId: contact.id,
          receiverId: userId,
          deliveredAt: null, // Using deliveredAt to track read status
        },
      });

      conversationsMap.set(contact.id, {
        contactHandle: contact.handle,
        contact: {
          id: contact.id,
          handle: contact.handle,
          verified: contactRelation?.isVerified || false,
        },
        lastMessage: {
          content: message.content,
          timestamp: message.timestamp,
          isOwn: message.senderId === userId,
        },
        unreadCount,
      });
    }

    const formattedConversations = Array.from(conversationsMap.values());

    return reply.send({
      success: true,
      conversations: formattedConversations,
    });

  } catch (error) {
    logger.error('Get conversations error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to get conversations'
    });
  }
};

/**
 * Create or get conversation with a contact
 */
export const createConversation = async (
  request: FastifyRequest<{ Body: { contactHandle: string } }>,
  reply: FastifyReply
): Promise<void> => {
  try {
    const { contactHandle } = request.body;
    const userId = request.user!.userId;

    // Find the contact
    const contact = await prisma.user.findUnique({
      where: { handle: contactHandle },
      select: { id: true, handle: true }
    });

    if (!contact) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Contact not found'
      });
    }

    if (contact.id === userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot create conversation with yourself'
      });
    }

    // Check if contact relationship exists
    let contactRelation = await prisma.contact.findUnique({
      where: {
        userId_contactId: {
          userId,
          contactId: contact.id
        }
      }
    });

    // Create contact relationship if it doesn't exist
    if (!contactRelation) {
      contactRelation = await prisma.contact.create({
        data: {
          userId,
          contactId: contact.id,
          isVerified: false
        }
      });
    }

    return reply.status(201).send({
      success: true,
      conversation: {
        contactHandle: contact.handle,
        contact: {
          id: contact.id,
          handle: contact.handle,
          verified: contactRelation.isVerified
        },
        lastMessage: null,
        unreadCount: 0
      }
    });

  } catch (error) {
    logger.error('Create conversation error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to create conversation'
    });
  }
}; 