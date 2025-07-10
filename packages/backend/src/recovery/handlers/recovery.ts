import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/utils/logger';

export async function handleSeedRecovery(request: FastifyRequest, reply: FastifyReply) {
  logger.info('Recovery attempt received');
  return reply.status(501).send({ error: 'Not Implemented' });
} 