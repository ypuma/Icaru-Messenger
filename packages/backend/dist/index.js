"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const config_1 = require("@/utils/config");
const logger_1 = require("@/utils/logger");
const routes_1 = require("@/auth/routes");
const routes_2 = require("@/contacts/routes");
const routes_3 = require("@/messaging/routes");
const routes_4 = require("@/recovery/routes");
const routes_5 = require("@/admin/routes");
const routes_6 = require("@/users/routes");
const sessions_1 = require("@/auth/handlers/sessions");
const websocket_2 = require("@/messaging/websocket");
const db_1 = __importDefault(require("@/db"));
const fastify = (0, fastify_1.default)({
    logger: {
        level: config_1.config.LOG_LEVEL,
    },
});
async function startServer() {
    try {
        // Register plugins
        await fastify.register(helmet_1.default, {
            contentSecurityPolicy: false,
        });
        const corsOptions = {
            credentials: true,
            origin: config_1.config.NODE_ENV === 'development'
                ? '*' // Allow all origins in development
                : config_1.config.CORS_ORIGIN,
        };
        await fastify.register(cors_1.default, corsOptions);
        await fastify.register(rate_limit_1.default, {
            max: config_1.config.RATE_LIMIT_MAX,
            timeWindow: config_1.config.RATE_LIMIT_WINDOW,
            errorResponseBuilder: (request, context) => {
                return {
                    error: 'Rate Limit Exceeded',
                    message: `Too many requests, please try again later.`,
                    expiresIn: Math.round(context.ttl / 1000),
                };
            },
        });
        await fastify.register(websocket_1.default);
        // Health check endpoint
        fastify.get('/health', async (request, reply) => {
            try {
                // Check database connection
                await db_1.default.$queryRaw `SELECT 1`;
                return reply.send({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    environment: config_1.config.NODE_ENV,
                });
            }
            catch (error) {
                logger_1.logger.error('Health check failed:', error);
                return reply.status(503).send({
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    error: 'Database connection failed',
                });
            }
        });
        // API routes
        await fastify.register(routes_1.authRoutes, { prefix: '/api/auth' });
        await fastify.register(routes_2.contactRoutes, { prefix: '/api' });
        await fastify.register(routes_3.messagingRoutes, { prefix: '/api' });
        await fastify.register(routes_4.recoveryRoutes, { prefix: '/api' });
        await fastify.register(routes_6.userRoutes, { prefix: '/api/users' });
        await fastify.register(routes_5.adminRoutes, { prefix: '/api' });
        // Schedule stale session cleanup
        setInterval(sessions_1.cleanupStaleSessions, 5 * 60 * 1000); // Every 5 minutes
        // WebSocket for real-time messaging
        (0, websocket_2.setupWebSocket)(fastify);
        // Error handler
        fastify.setErrorHandler(function (error, _req, reply) {
            logger_1.logger.error('Unhandled error:', error);
            const isDevelopment = config_1.config.NODE_ENV === 'development';
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
            port: config_1.config.PORT,
            host: config_1.config.HOST,
        });
        logger_1.logger.info(`🚀 Secure Messenger API server running at ${address}`);
        logger_1.logger.info(`📊 Health check available at ${address}/health`);
        logger_1.logger.info(`🔌 WebSocket endpoint available at ${address}/ws`);
        logger_1.logger.info(`🌐 CORS enabled for: ${config_1.config.CORS_ORIGIN}`);
    }
    catch (error) {
        logger_1.logger.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown
const gracefulShutdown = async (signal) => {
    logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
        await fastify.close();
        await db_1.default.$disconnect();
        logger_1.logger.info('Server closed successfully');
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Error during shutdown:', error);
        process.exit(1);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
// Start the server
startServer();
//# sourceMappingURL=index.js.map