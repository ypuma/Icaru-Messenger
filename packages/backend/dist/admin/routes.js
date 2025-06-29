"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
const db_1 = __importDefault(require("@/db"));
const logger_1 = require("@/utils/logger");
const accounts_1 = require("../auth/handlers/accounts");
// In-memory store for dev purposes
const devStore = {
    adminSecret: process.env.ADMIN_SECRET || 'dev-secret',
};
// Middleware to check for admin secret
async function adminAuth(request, reply) {
    const secret = request.headers['x-admin-secret'];
    if (secret !== devStore.adminSecret) {
        return reply.status(401).send({ error: 'Unauthorized: Invalid admin secret' });
    }
}
async function handleReset(request, reply) {
    try {
        // 1. Clear rate limit attempts (if using a more persistent store)
        // For now, in-memory is reset on restart
        // 2. Clear database
        await db_1.default.user.deleteMany({});
        await db_1.default.message.deleteMany({});
        logger_1.logger.info('Admin action: Database has been reset.');
        return reply.send({ success: true, message: 'Rate limits and database cleared.' });
    }
    catch (error) {
        logger_1.logger.error('Failed to reset database:', error);
        return reply.status(500).send({ error: 'Database reset failed' });
    }
}
async function handleToggleRateLimit(request, reply) {
    try {
        const { disable } = request.body;
        (0, accounts_1.toggleRateLimit)(disable);
        return reply.send({ success: true, message: `Rate limiting is now ${disable ? 'disabled' : 'enabled'}.` });
    }
    catch (error) {
        logger_1.logger.error('Failed to toggle rate limit:', error);
        return reply.status(500).send({ error: 'Failed to toggle rate limit' });
    }
}
async function adminRoutes(fastify) {
    fastify.post('/reset', { preHandler: [adminAuth] }, handleReset);
    fastify.post('/toggle-rate-limit', {
        preHandler: [adminAuth],
        schema: {
            body: {
                type: 'object',
                properties: {
                    disable: { type: 'boolean' }
                },
                required: ['disable']
            }
        }
    }, handleToggleRateLimit);
}
//# sourceMappingURL=routes.js.map