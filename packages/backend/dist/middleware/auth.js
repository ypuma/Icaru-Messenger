"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@/utils/config");
const logger_1 = require("@/utils/logger");
const db_1 = __importDefault(require("@/db"));
const authenticateToken = async (request, reply) => {
    try {
        const authHeader = request.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (!token) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Access token required'
            });
        }
        // Verify JWT token
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.JWT_SECRET);
        // Check if session exists and is valid
        const session = await db_1.default.session.findUnique({
            where: {
                id: decoded.sessionId,
                token: token,
                expiresAt: {
                    gt: new Date()
                }
            },
            include: {
                user: true
            }
        });
        if (!session) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Invalid or expired session'
            });
        }
        // Update last heartbeat
        await db_1.default.session.update({
            where: { id: session.id },
            data: { lastHeartbeat: new Date() }
        });
        // Attach user info to request
        request.user = {
            userId: decoded.userId,
            deviceId: decoded.deviceId,
            sessionId: decoded.sessionId
        };
    }
    catch (error) {
        logger_1.logger.error('Authentication error:', error);
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Invalid token'
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Authentication failed'
        });
    }
};
exports.authenticateToken = authenticateToken;
const optionalAuth = async (request, reply) => {
    try {
        const authHeader = request.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (!token) {
            // No token provided, but that's okay for optional auth
            return;
        }
        // Try to authenticate, but don't fail if it doesn't work
        await (0, exports.authenticateToken)(request, reply);
    }
    catch (error) {
        // Log but don't fail the request
        logger_1.logger.debug('Optional auth failed:', error);
    }
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=auth.js.map