import { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            userId: string;
            deviceId: string;
            sessionId: string;
        };
    }
}
export declare const authenticateToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare const optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=auth.d.ts.map