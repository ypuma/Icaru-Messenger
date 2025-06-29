"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactRoutes = contactRoutes;
const contacts_1 = require("./handlers/contacts");
const auth_1 = require("@/middleware/auth");
async function contactRoutes(fastify) {
    // All contact routes require authentication
    fastify.register(async function (fastify) {
        fastify.addHook('preHandler', auth_1.authenticateToken);
        fastify.post('/contacts', contacts_1.addContact);
        fastify.get('/contacts', contacts_1.getContacts);
        fastify.put('/contacts', contacts_1.updateContact);
        fastify.delete('/contacts', contacts_1.deleteContact);
    });
}
//# sourceMappingURL=routes.js.map