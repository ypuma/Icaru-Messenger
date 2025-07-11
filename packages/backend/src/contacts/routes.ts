import { FastifyInstance } from 'fastify';
import { getContacts, addContact, deleteContact, updateContact } from './handlers/contacts';
import { authenticateToken } from '../middleware/auth';

export async function contactRoutes(fastify: FastifyInstance) {
  // All contact routes require authentication
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authenticateToken);

    instance.get('/', getContacts);
    instance.post('/', addContact);
    instance.put('/', updateContact);
    instance.delete('/:contactId', deleteContact);
  });
} 