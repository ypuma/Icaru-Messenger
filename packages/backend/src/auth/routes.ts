import { FastifyInstance } from 'fastify';
import {
  checkHandleAvailability,
  deleteAccount,
  healthCheck,
  createAccount,
  lookupAccountByPublicKey,
} from './handlers/accounts';
import { createSession, handleHeartbeat, logout } from './handlers/sessions';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', createAccount);
  fastify.post('/check-handle', checkHandleAvailability);
  fastify.post('/lookup-by-key', lookupAccountByPublicKey);
  fastify.delete('/account', deleteAccount);
  fastify.get('/health', healthCheck);
  fastify.post('/session', createSession);
  fastify.post('/heartbeat', handleHeartbeat);
  fastify.post('/logout', logout);
} 