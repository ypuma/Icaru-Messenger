import { FastifyInstance } from 'fastify';
import { keysRoutes } from './handlers/keys';
import { getConversations } from './handlers/conversations';
import { sendMessage, getMessages, markMessageDelivered, clearMessages } from './handlers/messages';
import { authenticateToken } from '../middleware/auth';

export const messagingRoutes = async (server: FastifyInstance) => {
  server.register(keysRoutes, { prefix: '/keys' });

  server.get(
    '/conversations',
    { preHandler: [authenticateToken] },
    getConversations
  );

  // Message routes
  server.post(
    '/messages',
    { preHandler: [authenticateToken] },
    sendMessage
  );

  server.get(
    '/messages',
    { preHandler: [authenticateToken] },
    getMessages
  );

  server.patch(
    '/messages/:messageId/delivered',
    { preHandler: [authenticateToken] },
    markMessageDelivered
  );

  server.delete(
    '/messages/clear',
    { preHandler: [authenticateToken] },
    clearMessages
  );
}; 