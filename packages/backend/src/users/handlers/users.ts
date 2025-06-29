import { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '@/db';
import { logger } from '@/utils/logger';

export async function getUserByHandle(
  request: FastifyRequest<{ Params: { handle: string } }>,
  reply: FastifyReply
) {
  const { handle } = request.params;
  // The user is authenticated by the middleware, but we don't need their ID for this.
  
  try {
    const user = await prisma.user.findUnique({
      where: { handle: handle.toUpperCase() },
      select: {
        id: true,
        handle: true,
        publicKey: true, // Required for E2EE
      },
    });

    if (!user) {
      return reply.code(404).send({ message: 'User not found' });
    }

    return reply.send(user);
  } catch (error) {
    logger.error(`Error fetching user by handle ${handle}:`, error);
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export const getPreKeyBundle = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const { handle } = request.params as { handle: string };

    // Find the user
    const user = await prisma.user.findUnique({
      where: { handle },
      select: { 
        id: true, 
        handle: true, 
        publicKey: true,
        // For now, return a mock PreKey bundle
        // In production, this would be stored in the database
      }
    });

    if (!user) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Mock PreKey bundle - in production, this would be generated and stored
    const preKeyBundle = {
      identityKey: user.publicKey,
      registrationId: 1, // Mock registration ID
      signedPreKey: {
        keyId: 1,
        publicKey: user.publicKey, // Mock - should be separate signed prekey
        signature: 'mock_signature' // Mock signature
      },
      preKey: {
        keyId: 1,
        publicKey: user.publicKey // Mock - should be separate prekey
      }
    };

    return reply.send({
      success: true,
      data: preKeyBundle
    });

  } catch (error) {
    logger.error('Get PreKey bundle error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to get PreKey bundle'
    });
  }
}; 