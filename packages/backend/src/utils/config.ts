import { z } from 'zod';

const configSchema = z.object({
  // Server
  PORT: z.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().default('file:./dev.db'),
  
  // JWT
  JWT_SECRET: z.string().default('your-super-secret-jwt-key-here-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  
  // Rate Limiting
  RATE_LIMIT_MAX: z.number().default(100),
  RATE_LIMIT_WINDOW: z.number().default(900000), // 15 minutes
  
  // Toggle for completely disabling Fastify rate-limiting middleware
  DISABLE_RATE_LIMIT: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        return val.toLowerCase() === 'true';
      }
      return val;
    },
    z.boolean().default(true)
  ),
  
  // Session
  SESSION_TIMEOUT: z.number().default(86400000), // 24 hours
  
  // Recovery
  RECOVERY_RATE_LIMIT: z.number().default(3),
  RECOVERY_RATE_WINDOW: z.number().default(3600000), // 1 hour
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

type Config = z.infer<typeof configSchema>;

const createConfig = (): Config => {
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
    DISABLE_RATE_LIMIT: process.env.DISABLE_RATE_LIMIT,
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

export const config = createConfig();
export default config; 