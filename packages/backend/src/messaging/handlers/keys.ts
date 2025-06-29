import { FastifyInstance } from 'fastify';
import db from '@/db';
import { logger } from '@/utils/logger';

export const keysRoutes = async (server: FastifyInstance) => {
  // Add a simple test endpoint
  server.get('/test', async (request, reply) => {
    try {
      const userCount = await db.user.count();
      return reply.send({ success: true, userCount, message: 'Database connection working' });
    } catch (error) {
      logger.error('Test endpoint error', { error });
      return reply.status(500).send({ error: 'Database connection failed' });
    }
  });

  server.get('/bundle/:handle', async (request, reply) => {
    const { handle } = request.params as { handle: string };

    try {
      logger.info(`Starting key bundle request for handle: ${handle}`);
      
      const user = await db.user.findUnique({
        where: { handle },
        include: {
          identity: true,
          signedPreKey: true,
        },
      });
      
      logger.info(`Fetched user for key bundle request: ${handle}`, { user });

      if (!user || !user.identity || !user.signedPreKey) {
        logger.warn(`Key bundle not found for user: ${handle}`);
        return reply.status(404).send({ error: 'Key bundle not found' });
      }
      
      // For now, we won't grab a one-time pre-key to keep it simple.
      // In a full implementation, you'd grab one and mark it as used.

      const keyBundle = {
        identityKey: user.identity.publicKey,
        signedPreKey: {
          key: user.signedPreKey.key,
          signature: user.signedPreKey.signature,
        },
      };

      logger.info(`Returning key bundle for user: ${handle}`, { keyBundle });
      return reply.send(keyBundle);

    } catch (error) {
      logger.error(`Error fetching key bundle for user: ${handle}`, { error });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}; 