import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '@/db';
import { logger } from '@/utils/logger';
import { toggleRateLimit } from '../auth/handlers/accounts';

// In-memory store for dev purposes
const devStore = {
  adminSecret: process.env.ADMIN_SECRET || 'dev-secret',
};

// Middleware to check for admin secret
async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
  const secret = request.headers['x-admin-secret'];
  if (secret !== devStore.adminSecret) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid admin secret' });
  }
}

async function handleReset(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 1. Clear rate limit attempts (if using a more persistent store)
    // For now, in-memory is reset on restart

    // 2. Clear database
    await prisma.user.deleteMany({});
    await prisma.message.deleteMany({});
    
    logger.info('Admin action: Database has been reset.');

    return reply.send({ success: true, message: 'Rate limits and database cleared.' });
  } catch (error) {
    logger.error('Failed to reset database:', error);
    return reply.status(500).send({ error: 'Database reset failed' });
  }
}

async function handleToggleRateLimit(
  request: FastifyRequest<{ Body: { disable: boolean } }>,
  reply: FastifyReply
) {
  try {
    const { disable } = request.body;
    toggleRateLimit(disable);
    return reply.send({ success: true, message: `Rate limiting is now ${disable ? 'disabled' : 'enabled'}.` });
  } catch (error) {
    logger.error('Failed to toggle rate limit:', error);
    return reply.status(500).send({ error: 'Failed to toggle rate limit' });
  }
}


export async function adminRoutes(fastify: FastifyInstance) {
  fastify.post('/reset', { preHandler: [adminAuth] }, handleReset);
  fastify.post(
    '/toggle-rate-limit',
    {
      preHandler: [adminAuth],
      schema: {
        body: {
          type: 'object',
          properties: {
            disable: { type: 'boolean' }
          },
          required: ['disable']
        }
      } as const
    },
    handleToggleRateLimit
  );
}