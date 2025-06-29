"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = userRoutes;
const auth_1 = require("../middleware/auth");
const users_1 = require("./handlers/users");
async function userRoutes(fastify) {
    // Get user by handle - requires authentication
    fastify.get('/handle/:handle', { preHandler: auth_1.authenticateToken }, users_1.getUserByHandle);
    // Get PreKey bundle for Signal Protocol - requires authentication
    fastify.get('/prekey-bundle/:handle', { preHandler: auth_1.authenticateToken }, users_1.getPreKeyBundle);
}
//# sourceMappingURL=routes.js.map