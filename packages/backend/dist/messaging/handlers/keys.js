"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.keysRoutes = void 0;
const db_1 = __importDefault(require("@/db"));
const logger_1 = require("@/utils/logger");
const keysRoutes = async (server) => {
    // Add a simple test endpoint
    server.get('/test', async (request, reply) => {
        try {
            const userCount = await db_1.default.user.count();
            return reply.send({ success: true, userCount, message: 'Database connection working' });
        }
        catch (error) {
            logger_1.logger.error('Test endpoint error', { error });
            return reply.status(500).send({ error: 'Database connection failed' });
        }
    });
    server.get('/bundle/:handle', async (request, reply) => {
        const { handle } = request.params;
        try {
            logger_1.logger.info(`Starting key bundle request for handle: ${handle}`);
            const user = await db_1.default.user.findUnique({
                where: { handle },
                include: {
                    identity: true,
                    signedPreKey: true,
                },
            });
            logger_1.logger.info(`Fetched user for key bundle request: ${handle}`, { user });
            if (!user || !user.identity || !user.signedPreKey) {
                logger_1.logger.warn(`Key bundle not found for user: ${handle}`);
                return reply.status(404).send({ error: 'Key bundle not found' });
            }
            // For now, we won't grab a one-time pre-key to keep it simple.
            // In a full implementation, you'd grab one and mark it as used.
            const keyBundle = {
                identityKey: user.identity.publicKey,
                signedPreKey: {
                    key: user.signedPreKey.key,
                    signature: user.signedPreKey.signature,
                },
            };
            logger_1.logger.info(`Returning key bundle for user: ${handle}`, { keyBundle });
            return reply.send(keyBundle);
        }
        catch (error) {
            logger_1.logger.error(`Error fetching key bundle for user: ${handle}`, { error });
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
};
exports.keysRoutes = keysRoutes;
//# sourceMappingURL=keys.js.map