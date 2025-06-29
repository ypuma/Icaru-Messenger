"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSeedRecovery = handleSeedRecovery;
const logger_1 = require("@/utils/logger");
async function handleSeedRecovery(request, reply) {
    // This is a placeholder for the recovery logic
    logger_1.logger.info('Recovery attempt received');
    return reply.status(501).send({ error: 'Not Implemented' });
}
//# sourceMappingURL=recovery.js.map