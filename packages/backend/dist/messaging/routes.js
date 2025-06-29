"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messagingRoutes = void 0;
const keys_1 = require("./handlers/keys");
const conversations_1 = require("./handlers/conversations");
const auth_1 = require("../middleware/auth");
const messagingRoutes = async (server) => {
    server.register(keys_1.keysRoutes, { prefix: '/keys' });
    server.get('/conversations', { preHandler: [auth_1.authenticateToken] }, conversations_1.getConversations);
};
exports.messagingRoutes = messagingRoutes;
//# sourceMappingURL=routes.js.map