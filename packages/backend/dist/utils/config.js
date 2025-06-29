"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const configSchema = zod_1.z.object({
    // Server
    PORT: zod_1.z.number().default(11401),
    HOST: zod_1.z.string().default('0.0.0.0'),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    // Database
    DATABASE_URL: zod_1.z.string().default('file:./dev.db'),
    // JWT
    JWT_SECRET: zod_1.z.string().default('your-super-secret-jwt-key-here-change-in-production'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    // CORS
    CORS_ORIGIN: zod_1.z.string().default('https://0.0.0.0:11402'),
    // Rate Limiting
    RATE_LIMIT_MAX: zod_1.z.number().default(100),
    RATE_LIMIT_WINDOW: zod_1.z.number().default(900000), // 15 minutes
    // Session
    SESSION_TIMEOUT: zod_1.z.number().default(86400000), // 24 hours
    // Recovery
    RECOVERY_RATE_LIMIT: zod_1.z.number().default(3),
    RECOVERY_RATE_WINDOW: zod_1.z.number().default(3600000), // 1 hour
    // Logging
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});
const createConfig = () => {
    const env = {
        PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        HOST: process.env.HOST,
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        CORS_ORIGIN: process.env.CORS_ORIGIN,
        RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : undefined,
        RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW, 10) : undefined,
        SESSION_TIMEOUT: process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT, 10) : undefined,
        RECOVERY_RATE_LIMIT: process.env.RECOVERY_RATE_LIMIT ? parseInt(process.env.RECOVERY_RATE_LIMIT, 10) : undefined,
        RECOVERY_RATE_WINDOW: process.env.RECOVERY_RATE_WINDOW ? parseInt(process.env.RECOVERY_RATE_WINDOW, 10) : undefined,
        LOG_LEVEL: process.env.LOG_LEVEL,
    };
    const result = configSchema.safeParse(env);
    if (!result.success) {
        console.error('❌ Invalid environment configuration:');
        console.error(result.error.flatten().fieldErrors);
        process.exit(1);
    }
    return result.data;
};
exports.config = createConfig();
exports.default = exports.config;
//# sourceMappingURL=config.js.map