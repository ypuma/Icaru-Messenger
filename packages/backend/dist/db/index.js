"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("@/utils/logger");
const createPrismaClient = () => {
    const client = new client_1.PrismaClient({
        log: [
            { level: 'query', emit: 'event' },
            { level: 'warn', emit: 'stdout' },
            { level: 'error', emit: 'stdout' },
        ],
    });
    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
        client.$on('query', (e) => {
            logger_1.logger.debug('Query: ' + e.query);
            logger_1.logger.debug('Params: ' + e.params);
            logger_1.logger.debug('Duration: ' + e.duration + 'ms');
        });
    }
    return client;
};
// Use global variable in development to prevent multiple instances
const prisma = globalThis.__prisma ?? createPrismaClient();
exports.prisma = prisma;
if (process.env.NODE_ENV === 'development') {
    globalThis.__prisma = prisma;
}
exports.default = prisma;
//# sourceMappingURL=index.js.map