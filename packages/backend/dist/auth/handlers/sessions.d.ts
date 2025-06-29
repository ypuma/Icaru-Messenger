import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
declare const sessionCreateSchema: z.ZodObject<{
    handle: z.ZodString;
    deviceId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    handle: string;
    deviceId: string;
}, {
    handle: string;
    deviceId: string;
}>;
declare const heartbeatSchema: z.ZodObject<{
    sessionId: z.ZodString;
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
    sessionId: string;
}, {
    token: string;
    sessionId: string;
}>;
export interface SessionData {
    id: string;
    userId: string;
    deviceId: string;
    token: string;
    isActive: boolean;
    lastHeartbeat: Date;
    createdAt: Date;
    expiresAt: Date;
}
/**
 * Create a new user session
 */
export declare const createSession: (request: FastifyRequest<{
    Body: typeof sessionCreateSchema._type;
}>, reply: FastifyReply) => Promise<never>;
/**
 * Handle session heartbeat
 */
export declare const handleHeartbeat: (request: FastifyRequest<{
    Body: typeof heartbeatSchema._type;
}>, reply: FastifyReply) => Promise<never>;
/**
 * Cleanup stale sessions (called periodically)
 */
export declare const cleanupStaleSessions: () => Promise<void>;
/**
 * Logout and invalidate session
 */
export declare const logout: (request: FastifyRequest<{
    Body: typeof heartbeatSchema._type;
}>, reply: FastifyReply) => Promise<never>;
export {};
//# sourceMappingURL=sessions.d.ts.map