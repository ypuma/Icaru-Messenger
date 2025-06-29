import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import prisma from '@/db';

// Validation schemas
const addContactSchema = z.object({
  contactHandle: z.string().min(3).max(30),
  nickname: z.string().optional(),
});

const updateContactSchema = z.object({
  contactId: z.string(),
  nickname: z.string().optional(),
  isBlocked: z.boolean().optional(),
});

const deleteContactSchema = z.object({
  contactHandle: z.string(),
});

export const addContact = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const body = addContactSchema.parse(request.body);
    const userId = request.user!.userId;

    // Find the contact user by handle
    const contactUser = await prisma.user.findUnique({
      where: { handle: body.contactHandle },
      select: { id: true, handle: true, publicKey: true }
    });

    if (!contactUser) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    if (contactUser.id === userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot add yourself as a contact'
      });
    }

    // Check if contact already exists
    const existingContact = await prisma.contact.findUnique({
      where: {
        userId_contactId: {
          userId,
          contactId: contactUser.id
        }
      }
    });

    if (existingContact) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Contact already exists'
      });
    }

    // Create the contact
    const contact = await prisma.contact.create({
      data: {
        userId,
        contactId: contactUser.id,
        nickname: body.nickname,
      },
      include: {
        contact: {
          select: {
            id: true,
            handle: true,
            publicKey: true,
          }
        }
      }
    });

    logger.info(`Contact added: ${body.contactHandle} by user ${userId}`);

    return reply.status(201).send({
      success: true,
      message: 'Contact added successfully',
      contact: {
        id: contact.id,
        handle: contact.contact.handle,
        publicKey: contact.contact.publicKey,
        nickname: contact.nickname,
        isVerified: contact.isVerified,
        isBlocked: contact.isBlocked,
        addedAt: contact.addedAt,
      }
    });

  } catch (error) {
    logger.error('Add contact error:', error);

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid input data',
        details: error.errors
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to add contact'
    });
  }
};

export const getContacts = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const userId = request.user!.userId;

    const contacts = await prisma.contact.findMany({
      where: { userId },
      include: {
        contact: {
          select: {
            id: true,
            handle: true,
            publicKey: true,
          }
        }
      },
      orderBy: { addedAt: 'desc' }
    });

    return reply.send({
      success: true,
      contacts: contacts.map((contact: any) => ({
        id: contact.id,
        handle: contact.contact.handle,
        publicKey: contact.contact.publicKey,
        nickname: contact.nickname,
        isVerified: contact.isVerified,
        isBlocked: contact.isBlocked,
        addedAt: contact.addedAt,
        verifiedAt: contact.verifiedAt,
      }))
    });

  } catch (error) {
    logger.error('Get contacts error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to get contacts'
    });
  }
};

export const updateContact = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const body = updateContactSchema.parse(request.body);
    const userId = request.user!.userId;

    const contact = await prisma.contact.findFirst({
      where: {
        id: body.contactId,
        userId
      }
    });

    if (!contact) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Contact not found'
      });
    }

    const updatedContact = await prisma.contact.update({
      where: { id: body.contactId },
      data: {
        nickname: body.nickname,
        isBlocked: body.isBlocked,
      },
      include: {
        contact: {
          select: {
            id: true,
            handle: true,
            publicKey: true,
          }
        }
      }
    });

    return reply.send({
      success: true,
      message: 'Contact updated successfully',
      contact: {
        id: updatedContact.id,
        handle: updatedContact.contact.handle,
        publicKey: updatedContact.contact.publicKey,
        nickname: updatedContact.nickname,
        isVerified: updatedContact.isVerified,
        isBlocked: updatedContact.isBlocked,
        addedAt: updatedContact.addedAt,
        verifiedAt: updatedContact.verifiedAt,
      }
    });

  } catch (error) {
    logger.error('Update contact error:', error);

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid input data',
        details: error.errors
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to update contact'
    });
  }
};

export const deleteContact = async (request: FastifyRequest, reply: FastifyReply) => {
  const { userId } = request.user!;
  const { handle: contactHandle } = request.params as { handle: string };

  try {
    // Find the user to be deleted
    const contactUser = await prisma.user.findUnique({
      where: { handle: contactHandle },
    });

    if (!contactUser) {
      return reply.status(404).send({ message: 'Contact not found' });
    }

    // Begin a transaction to ensure both sides of the relationship are deleted
    await prisma.$transaction(async (tx) => {
      // Delete the relationship from the current user's perspective
      await tx.contact.deleteMany({
        where: {
          userId: userId,
          contactId: contactUser.id,
        },
      });

      // Delete the relationship from the other user's perspective
      await tx.contact.deleteMany({
        where: {
          userId: contactUser.id,
          contactId: userId,
        },
      });
    });

    logger.info(`User ${userId} deleted contact ${contactHandle} (${contactUser.id})`);
    reply.status(204).send();

  } catch (error) {
    logger.error(`Failed to delete contact for user ${userId}:`, error);
    reply.status(500).send({ message: 'Failed to delete contact' });
  }
}; 