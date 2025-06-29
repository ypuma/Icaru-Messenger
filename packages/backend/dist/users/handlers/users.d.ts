import { FastifyReply, FastifyRequest } from 'fastify';
export declare function getUserByHandle(request: FastifyRequest<{
    Params: {
        handle: string;
    };
}>, reply: FastifyReply): Promise<never>;
export declare const getPreKeyBundle: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=users.d.ts.map