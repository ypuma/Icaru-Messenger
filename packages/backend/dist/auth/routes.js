"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const accounts_1 = require("./handlers/accounts");
const sessions_1 = require("./handlers/sessions");
async function authRoutes(fastify) {
    fastify.post('/register', accounts_1.createAccount);
    fastify.post('/check-handle', accounts_1.checkHandleAvailability);
    fastify.post('/lookup-by-key', accounts_1.lookupAccountByPublicKey);
    fastify.delete('/account', accounts_1.deleteAccount);
    fastify.get('/health', accounts_1.healthCheck);
    fastify.post('/session', sessions_1.createSession);
    fastify.post('/heartbeat', sessions_1.handleHeartbeat);
    fastify.post('/logout', sessions_1.logout);
}
//# sourceMappingURL=routes.js.map