import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import { authRoutes } from '@/auth/routes';
import { contactRoutes } from '@/contacts/routes';
import { messagingRoutes } from '@/messaging/routes';
import { recoveryRoutes } from '@/recovery/routes';
import { adminRoutes } from '@/admin/routes';
import { userRoutes } from '@/users/routes';
import { cleanupStaleSessions } from '@/auth/handlers/sessions';
import { setupWebSocket } from '@/messaging/websocket';
import prisma from '@/db';

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
});

async function startServer() {
  try {
    // Register plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
    });

    const corsOptions = {
      credentials: true,
      origin: config.NODE_ENV === 'development'
        ? '*' // Allow all origins in development
        : config.CORS_ORIGIN,
    };
    await fastify.register(cors, corsOptions);

    if (!config.DISABLE_RATE_LIMIT) {
      await fastify.register(rateLimit, {
        max: config.RATE_LIMIT_MAX,
        timeWindow: config.RATE_LIMIT_WINDOW,
        errorResponseBuilder: (_request, context) => {
          return {
            error: 'Rate Limit Exceeded',
            message: `Too many requests, please try again later.`,
            expiresIn: Math.round(context.ttl / 1000),
          };
        },
      });
    } else {
      logger.info('Global rate limiting has been disabled via configuration. Account creation limiter remains active.');
    }

    await fastify.register(websocket);

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        
        return reply.send({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: config.NODE_ENV,
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        return reply.status(503).send({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Database connection failed',
        });
      }
    });

    // API routes
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(contactRoutes, { prefix: '/api/contacts' });
    await fastify.register(messagingRoutes, { prefix: '/api' });
    await fastify.register(recoveryRoutes, { prefix: '/api' });
    await fastify.register(userRoutes, { prefix: '/api/users' });
    await fastify.register(adminRoutes, { prefix: '/api' });

    // Schedule stale session cleanup
    setInterval(cleanupStaleSessions, 5 * 60 * 1000); // Every 5 minutes

    // WebSocket for real-time messaging
    setupWebSocket(fastify);

    // Error handler
    fastify.setErrorHandler(function (error, _req, reply) {
      logger.error('Unhandled error:', error);

      const isDevelopment = config.NODE_ENV === 'development';
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: isDevelopment ? error.message : 'Something went wrong',
        ...(isDevelopment && { stack: error.stack }),
      });
    });

    // 404 handler
    fastify.setNotFoundHandler(async (request, reply) => {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
      });
    });

    // Start server
    const address = await fastify.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info(`🚀 Secure Messenger API server running at ${address}`);
    logger.info(`📊 Health check available at ${address}/health`);
    logger.info(`🔌 WebSocket endpoint available at ${address}/ws`);
    logger.info(`🌐 CORS enabled for: ${config.CORS_ORIGIN}`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await fastify.close();
    await prisma.$disconnect();
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer(); 