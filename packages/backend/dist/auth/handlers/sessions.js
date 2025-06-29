"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.cleanupStaleSessions = exports.handleHeartbeat = exports.createSession = void 0;
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("@/db"));
const logger_1 = require("@/utils/logger");
const config_1 = require("@/utils/config");
// Session creation schema
const sessionCreateSchema = zod_1.z.object({
    handle: zod_1.z.string().regex(/^[A-Z]{3}-\d{3}$/, 'Handle must be in format ABC-123'),
    deviceId: zod_1.z.string().min(1)
});
// Heartbeat schema
const heartbeatSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1), // Accept any non-empty string (CUID format)
    token: zod_1.z.string()
});
/**
 * Create a new user session
 */
const createSession = async (request, reply) => {
    try {
        const { handle, deviceId } = sessionCreateSchema.parse(request.body);
        // Find the user
        logger_1.logger.info(`Looking for user with handle: "${handle}"`);
        const user = await db_1.default.user.findUnique({
            where: { handle }
        });
        if (!user) {
            // Debug: Let's see all users in the database
            const allUsers = await db_1.default.user.findMany({
                select: { handle: true }
            });
            logger_1.logger.info(`User not found. All users in database: ${JSON.stringify(allUsers.map((u) => u.handle))}`);
            return reply.status(404).send({
                error: 'User not found',
                message: 'No user found with this handle'
            });
        }
        // Check for existing active sessions and invalidate them
        await db_1.default.session.updateMany({
            where: {
                userId: user.id,
                isActive: true
            },
            data: {
                isActive: false
            }
        });
        // Check if device exists, create if not
        let device = await db_1.default.device.findUnique({
            where: { deviceId }
        });
        if (!device) {
            // Also check if a device with this public key already exists for this user
            const existingDeviceWithKey = await db_1.default.device.findUnique({
                where: { publicKey: user.publicKey }
            });
            if (existingDeviceWithKey) {
                // Update the existing device with new deviceId
                device = await db_1.default.device.update({
                    where: { id: existingDeviceWithKey.id },
                    data: {
                        deviceId,
                        isActive: true,
                        lastSeen: new Date()
                    }
                });
                logger_1.logger.info(`Updated existing device with same public key: ${device.id}`);
            }
            else {
                logger_1.logger.info(`Creating new device record for deviceId: ${deviceId}`);
                // Create device record with basic Signal Protocol data
                device = await db_1.default.device.create({
                    data: {
                        userId: user.id,
                        deviceId,
                        publicKey: user.publicKey, // Use user's public key for device
                        registrationId: Math.floor(Math.random() * 16380) + 1, // Random registration ID (1-16383)
                        signedPreKeyId: 1,
                        signedPreKey: user.publicKey, // Placeholder - should be actual signed pre-key
                        preKeySignature: "placeholder_signature", // Placeholder - should be actual signature
                        identityKey: user.publicKey, // Use user's identity key
                        isActive: true
                    }
                });
                logger_1.logger.info(`Device created with ID: ${device.id}`);
            }
        }
        else {
            // Update device as active and last seen
            device = await db_1.default.device.update({
                where: { deviceId },
                data: {
                    isActive: true,
                    lastSeen: new Date()
                }
            });
            logger_1.logger.info(`Updated existing device: ${device.id}`);
        }
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry
        // Create new session first to get the session ID
        const session = await db_1.default.session.create({
            data: {
                userId: user.id,
                deviceId: device.id, // Use the device's ID (primary key)
                token: 'placeholder', // Will be updated with JWT
                isActive: true,
                lastHeartbeat: new Date(),
                expiresAt
            }
        });
        // Generate JWT token with session info
        const jwtPayload = {
            userId: user.id,
            deviceId: device.id,
            sessionId: session.id
        };
        const token = jsonwebtoken_1.default.sign(jwtPayload, config_1.config.JWT_SECRET, {
            expiresIn: '24h'
        });
        // Update session with the JWT token
        const updatedSession = await db_1.default.session.update({
            where: { id: session.id },
            data: {
                token
            }
        });
        logger_1.logger.info(`Session created for user ${handle} on device ${deviceId}`);
        return reply.status(201).send({
            sessionId: updatedSession.id,
            token: updatedSession.token,
            expiresAt: updatedSession.expiresAt,
            message: 'Session created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Session creation failed:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Validation Error',
                message: error.errors
            });
        }
        // Handle Prisma constraint errors
        if (error.code === 'P2002') {
            logger_1.logger.error('Database constraint violation:', error.meta);
            // Check if it's the unique constraint on userId + isActive
            if (error.meta?.target?.includes('userId') && error.meta?.target?.includes('isActive')) {
                return reply.status(409).send({
                    error: 'Session Conflict',
                    message: 'User already has an active session. Multiple active sessions are not allowed.'
                });
            }
            return reply.status(409).send({
                error: 'Constraint Violation',
                message: 'Database constraint violation: ' + (error.meta?.target || 'unknown')
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to create session',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
exports.createSession = createSession;
/**
 * Handle session heartbeat
 */
const handleHeartbeat = async (request, reply) => {
    try {
        const { sessionId, token } = heartbeatSchema.parse(request.body);
        // Find and validate session
        const session = await db_1.default.session.findUnique({
            where: {
                id: sessionId
            }
        });
        if (!session) {
            return reply.status(404).send({
                error: 'Session not found',
                message: 'Invalid session ID'
            });
        }
        if (!session.isActive) {
            return reply.status(401).send({
                error: 'Session inactive',
                message: 'Session has been terminated'
            });
        }
        if (session.token !== token) {
            return reply.status(401).send({
                error: 'Invalid token',
                message: 'Session token mismatch'
            });
        }
        if (session.expiresAt < new Date()) {
            // Mark session as expired
            await db_1.default.session.update({
                where: { id: sessionId },
                data: { isActive: false }
            });
            return reply.status(401).send({
                error: 'Session expired',
                message: 'Session has expired'
            });
        }
        // Update heartbeat and extend session expiry
        const newExpiresAt = new Date();
        newExpiresAt.setHours(newExpiresAt.getHours() + 24); // Extend by 24 hours
        const updatedSession = await db_1.default.session.update({
            where: { id: sessionId },
            data: {
                lastHeartbeat: new Date(),
                expiresAt: newExpiresAt
            }
        });
        return reply.send({
            success: true,
            message: 'Heartbeat received',
            newExpiresAt: updatedSession.expiresAt,
        });
    }
    catch (error) {
        logger_1.logger.error('Heartbeat handling failed:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Validation Error',
                message: error.errors
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to process heartbeat'
        });
    }
};
exports.handleHeartbeat = handleHeartbeat;
/**
 * Cleanup stale sessions (called periodically)
 */
const cleanupStaleSessions = async () => {
    try {
        const fiveMinutesAgo = new Date();
        fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
        // Find sessions with no heartbeat for 5+ minutes
        const staleSessions = await db_1.default.session.findMany({
            where: {
                isActive: true,
                lastHeartbeat: {
                    lt: fiveMinutesAgo
                }
            }
        });
        if (staleSessions.length > 0) {
            // Mark them as inactive
            await db_1.default.session.updateMany({
                where: {
                    id: {
                        in: staleSessions.map((s) => s.id)
                    }
                },
                data: {
                    isActive: false
                }
            });
            logger_1.logger.info(`Cleaned up ${staleSessions.length} stale sessions`);
        }
        // Also cleanup expired sessions
        const expiredSessions = await db_1.default.session.updateMany({
            where: {
                isActive: true,
                expiresAt: {
                    lt: new Date()
                }
            },
            data: {
                isActive: false
            }
        });
        if (expiredSessions.count > 0) {
            logger_1.logger.info(`Cleaned up ${expiredSessions.count} expired sessions`);
        }
    }
    catch (error) {
        logger_1.logger.error('Session cleanup failed:', error);
    }
};
exports.cleanupStaleSessions = cleanupStaleSessions;
/**
 * Logout and invalidate session
 */
const logout = async (request, reply) => {
    try {
        const { sessionId, token } = heartbeatSchema.parse(request.body);
        // Find and validate session
        const session = await db_1.default.session.findUnique({
            where: { id: sessionId }
        });
        if (!session || session.token !== token) {
            return reply.status(401).send({
                error: 'Invalid session',
                message: 'Session not found or token mismatch'
            });
        }
        // Invalidate session
        await db_1.default.session.update({
            where: { id: sessionId },
            data: {
                isActive: false
            }
        });
        logger_1.logger.info(`Session ${sessionId} logged out`);
        return reply.status(200).send({
            status: 'success',
            message: 'Logged out successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Logout failed:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Validation Error',
                message: error.errors
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to logout'
        });
    }
};
exports.logout = logout;
//# sourceMappingURL=sessions.js.map