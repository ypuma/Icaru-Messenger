import { FastifyInstance } from 'fastify';
import { keysRoutes } from './handlers/keys';
import { getConversations } from './handlers/conversations';
import { authenticateToken } from '../middleware/auth';

export const messagingRoutes = async (server: FastifyInstance) => {
  server.register(keysRoutes, { prefix: '/keys' });

  server.get(
    '/conversations',
    { preHandler: [authenticateToken] },
    getConversations
  );
}; 