import { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Get conversations for current user
 */
export declare const getConversations: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Create or get conversation with a contact
 */
export declare const createConversation: (request: FastifyRequest<{
    Body: {
        contactHandle: string;
    };
}>, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=conversations.d.ts.map