"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearRecoveryAttempts = clearRecoveryAttempts;
exports.recoveryRoutes = recoveryRoutes;
const recovery_1 = require("./handlers/recovery");
// Simple in-memory store for recovery attempts per IP
const recoveryAttempts = new Map();
const MAX_ATTEMPTS_PER_HOUR = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Helper to prune outdated attempts
function pruneAttempts(ip) {
    const now = Date.now();
    const attempts = recoveryAttempts.get(ip) || [];
    const recent = attempts.filter((t) => now - t < WINDOW_MS);
    recoveryAttempts.set(ip, recent);
}
// Exposed helper to clear all stored attempts (useful for admin resets or tests)
function clearRecoveryAttempts() {
    recoveryAttempts.clear();
}
async function recoveryRoutes(fastify) {
    fastify.post('/recover', recovery_1.handleSeedRecovery);
    /**
     * Check current rate-limit status for the caller IP
     * GET /recovery/rate-limit
     */
    fastify.get('/recovery/rate-limit', async (request, reply) => {
        const ip = request.ip;
        pruneAttempts(ip);
        const attempts = recoveryAttempts.get(ip) || [];
        const allowed = attempts.length < MAX_ATTEMPTS_PER_HOUR;
        let retryAfter = 0;
        if (!allowed) {
            const oldest = Math.min(...attempts);
            retryAfter = Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000); // seconds
        }
        return reply.send({ allowed, retryAfter });
    });
    /**
     * Record recovery attempt outcome
     * POST /recovery/rate-limit  { success: boolean }
     * - Records failed attempts; on success, clears attempt history
     */
    fastify.post('/recovery/rate-limit', {
        schema: {
            body: {
                type: 'object',
                required: ['success'],
                properties: {
                    success: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const ip = request.ip;
        const { success } = request.body;
        pruneAttempts(ip);
        if (success) {
            // On successful recovery, clear failed attempts for IP
            recoveryAttempts.delete(ip);
            return reply.send({ recorded: true, allowed: true, retryAfter: 0 });
        }
        // Record failed attempt
        const attempts = recoveryAttempts.get(ip) || [];
        attempts.push(Date.now());
        recoveryAttempts.set(ip, attempts);
        const allowed = attempts.length < MAX_ATTEMPTS_PER_HOUR;
        let retryAfter = 0;
        if (!allowed) {
            const oldest = Math.min(...attempts);
            retryAfter = Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000);
        }
        return reply.send({ recorded: true, allowed, retryAfter });
    });
    fastify.get('/rate-limit', async (request, reply) => {
        // NOTE: This is a placeholder. In a real implementation, you would
        // use a more robust rate-limiting mechanism like a Redis-backed store
        // associated with the user's IP address.
        return reply.send({
            allowed: true,
            retryAfter: 0,
        });
    });
}
//# sourceMappingURL=routes.js.map