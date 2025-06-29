"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreKeyBundle = void 0;
exports.getUserByHandle = getUserByHandle;
const db_1 = __importDefault(require("@/db"));
const logger_1 = require("@/utils/logger");
async function getUserByHandle(request, reply) {
    const { handle } = request.params;
    // The user is authenticated by the middleware, but we don't need their ID for this.
    try {
        const user = await db_1.default.user.findUnique({
            where: { handle: handle.toUpperCase() },
            select: {
                id: true,
                handle: true,
                publicKey: true, // Required for E2EE
            },
        });
        if (!user) {
            return reply.code(404).send({ message: 'Benutzer nicht gefunden' });
        }
        return reply.send(user);
    }
    catch (error) {
        logger_1.logger.error(`Error fetching user by handle ${handle}:`, error);
        return reply.code(500).send({ message: 'Internal server error' });
    }
}
const getPreKeyBundle = async (request, reply) => {
    try {
        const { handle } = request.params;
        // Find the user
        const user = await db_1.default.user.findUnique({
            where: { handle },
            select: {
                id: true,
                handle: true,
                publicKey: true,
                // For now, return a mock PreKey bundle
                // In production, this would be stored in the database
            }
        });
        if (!user) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Benutzer nicht gefunden'
            });
        }
        // Mock PreKey bundle - in production, this would be generated and stored
        const preKeyBundle = {
            identityKey: user.publicKey,
            registrationId: 1, // Mock registration ID
            signedPreKey: {
                keyId: 1,
                publicKey: user.publicKey, // Mock - should be separate signed prekey
                signature: 'mock_signature' // Mock signature
            },
            preKey: {
                keyId: 1,
                publicKey: user.publicKey // Mock - should be separate prekey
            }
        };
        return reply.send({
            success: true,
            data: preKeyBundle
        });
    }
    catch (error) {
        logger_1.logger.error('Get PreKey bundle error:', error);
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to get PreKey bundle'
        });
    }
};
exports.getPreKeyBundle = getPreKeyBundle;
//# sourceMappingURL=users.js.map