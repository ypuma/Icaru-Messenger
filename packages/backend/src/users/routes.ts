import { FastifyInstance } from 'fastify';
import { authenticateToken } from '../middleware/auth';
import { 
  getUserByHandle,
  getPreKeyBundle
} from './handlers/users';

export async function userRoutes(fastify: FastifyInstance) {
  // Get user by handle - requires authentication
  fastify.get<{Params: {handle: string}}>('/handle/:handle', { preHandler: authenticateToken }, getUserByHandle);

  // Get PreKey bundle for Signal Protocol - requires authentication
  fastify.get<{Params: {handle: string}}>('/prekey-bundle/:handle', { preHandler: authenticateToken }, getPreKeyBundle);
} 