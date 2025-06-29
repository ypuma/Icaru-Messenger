"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionService = exports.SessionService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@/utils/config");
const logger_1 = require("@/utils/logger");
const db_1 = __importDefault(require("@/db"));
class SessionService {
    /**
     * Create a new session for a user
     */
    async createSession(userId, deviceId, ipAddress, userAgent) {
        try {
            // Create session in database
            const session = await db_1.default.session.create({
                data: {
                    userId,
                    deviceId,
                    sessionToken: '', // Will be updated with JWT
                    expiresAt: new Date(Date.now() + config_1.config.SESSION_TIMEOUT),
                    ipAddress,
                    userAgent,
                }
            });
            // Create JWT token
            const tokenPayload = {
                userId,
                deviceId,
                sessionId: session.id,
            };
            const token = jsonwebtoken_1.default.sign(tokenPayload, config_1.config.JWT_SECRET);
            // Update session with token
            const updatedSession = await db_1.default.session.update({
                where: { id: session.id },
                data: { sessionToken: token }
            });
            logger_1.logger.info(`Session created for user ${userId}, device ${deviceId}`);
            return {
                token,
                session: updatedSession,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create session:', error);
            throw new Error('Session creation failed');
        }
    }
    /**
     * Validate and refresh a session
     */
    async validateSession(sessionId) {
        try {
            const session = await db_1.default.session.findUnique({
                where: {
                    id: sessionId,
                    expiresAt: {
                        gt: new Date()
                    }
                }
            });
            if (!session) {
                return false;
            }
            // Update last activity
            await db_1.default.session.update({
                where: { id: sessionId },
                data: { lastActivity: new Date() }
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error('Session validation failed:', error);
            return false;
        }
    }
    /**
     * End a session
     */
    async endSession(sessionId) {
        try {
            await db_1.default.session.delete({
                where: { id: sessionId }
            });
            logger_1.logger.info(`Session ${sessionId} ended`);
        }
        catch (error) {
            logger_1.logger.error('Failed to end session:', error);
            throw new Error('Session termination failed');
        }
    }
    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions() {
        try {
            const result = await db_1.default.session.deleteMany({
                where: {
                    expiresAt: {
                        lt: new Date()
                    }
                }
            });
            if (result.count > 0) {
                logger_1.logger.info(`Cleaned up ${result.count} expired sessions`);
            }
            return result.count;
        }
        catch (error) {
            logger_1.logger.error('Failed to cleanup expired sessions:', error);
            return 0;
        }
    }
    /**
     * Get active sessions for a user
     */
    async getUserSessions(userId) {
        try {
            const sessions = await db_1.default.session.findMany({
                where: {
                    userId,
                    expiresAt: {
                        gt: new Date()
                    }
                },
                select: {
                    id: true,
                    deviceId: true,
                    lastActivity: true,
                    createdAt: true,
                    ipAddress: true,
                    userAgent: true,
                },
                orderBy: { lastActivity: 'desc' }
            });
            return sessions;
        }
        catch (error) {
            logger_1.logger.error('Failed to get user sessions:', error);
            return [];
        }
    }
    /**
     * Terminate all sessions for a user (useful for security)
     */
    async terminateAllUserSessions(userId) {
        try {
            const result = await db_1.default.session.deleteMany({
                where: { userId }
            });
            logger_1.logger.info(`Terminated ${result.count} sessions for user ${userId}`);
            return result.count;
        }
        catch (error) {
            logger_1.logger.error('Failed to terminate user sessions:', error);
            return 0;
        }
    }
}
exports.SessionService = SessionService;
// Export singleton instance
exports.sessionService = new SessionService();
//# sourceMappingURL=session.js.map