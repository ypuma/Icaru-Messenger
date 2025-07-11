import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { handleSeedRecovery } from './handlers/recovery';

const recoveryAttempts: Map<string, number[]> = new Map();

const MAX_ATTEMPTS_PER_HOUR = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Helper to prune outdated attempts
function pruneAttempts(ip: string) {
  const now = Date.now();
  const attempts = recoveryAttempts.get(ip) || [];
  const recent = attempts.filter((t) => now - t < WINDOW_MS);
  recoveryAttempts.set(ip, recent);
}

// Exposed helper to clear all stored attempts (useful for admin resets or tests)
export function clearRecoveryAttempts() {
  recoveryAttempts.clear();
}

export async function recoveryRoutes(fastify: FastifyInstance) {
  fastify.post('/recover', handleSeedRecovery);

  /**
   * Check current rate-limit status for the caller IP
   * GET /recovery/rate-limit
   */
  fastify.get('/recovery/rate-limit', async (request: FastifyRequest, reply: FastifyReply) => {
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
  }, async (request: FastifyRequest<{ Body: { success: boolean } }>, reply: FastifyReply) => {
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

    return reply.send({
      allowed: true,
      retryAfter: 0,
    });
  });
} 