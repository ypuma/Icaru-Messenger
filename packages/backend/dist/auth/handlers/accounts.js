"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleRateLimit = toggleRateLimit;
exports.checkHandleAvailability = checkHandleAvailability;
exports.createAccount = createAccount;
exports.getAccount = getAccount;
exports.deleteAccount = deleteAccount;
exports.healthCheck = healthCheck;
exports.lookupAccountByPublicKey = lookupAccountByPublicKey;
const client_1 = require("@prisma/client");
const libsignal = __importStar(require("@signalapp/libsignal-client"));
const signalCrypto_1 = require("@/crypto/signalCrypto");
const logger_1 = require("@/utils/logger");
const prismaClient = new client_1.PrismaClient();
// Global flag to control rate limiting
let isRateLimitDisabled = false;
// Rate limiting tracker (in production, use Redis)
const rateLimitTracker = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
/**
 * Rate limiting middleware for account operations
 */
function checkRateLimit(request) {
    if (isRateLimitDisabled) {
        logger_1.logger.warn('Rate limiting is temporarily disabled.');
        return true;
    }
    const clientIp = request.ip;
    const now = Date.now();
    const existing = rateLimitTracker.get(clientIp);
    if (!existing || now > existing.resetTime) {
        rateLimitTracker.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
        return false;
    }
    existing.count++;
    return true;
}
/**
 * Toggles the rate limit on or off.
 */
function toggleRateLimit(shouldDisable) {
    isRateLimitDisabled = shouldDisable;
    logger_1.logger.info(`Rate limiting has been ${shouldDisable ? 'disabled' : 'enabled'}.`);
}
/**
 * Validate handle format
 */
function validateHandle(handle) {
    if (!handle || typeof handle !== 'string') {
        return { valid: false, error: 'Handle is required and must be a string' };
    }
    if (!/^[A-Z]{3}-\d{3}$/.test(handle)) {
        return { valid: false, error: 'Handle must be in format ABC-123' };
    }
    return { valid: true };
}
/**
 * Validate and normalize public key format
 * Accepts both Signal Protocol keys and composite Sodium keys
 */
function validatePublicKey(publicKey) {
    try {
        if (!publicKey || typeof publicKey !== 'string') {
            return { valid: false, error: 'Public key is required' };
        }
        // Try to parse as JSON (Sodium/WebCrypto composite key format)
        try {
            const keyData = JSON.parse(publicKey);
            if (keyData.sign && keyData.encrypt &&
                (keyData.type === 'sodium-composite' || keyData.type === 'webcrypto-composite')) {
                // Valid composite key format
                console.log(`Detected ${keyData.type} key format`);
                return { valid: true, normalizedKey: publicKey };
            }
        }
        catch {
            // Not JSON, continue with other formats
        }
        // Try Signal Protocol format
        try {
            const keyBuffer = Buffer.from(publicKey, 'base64');
            libsignal.PublicKey.deserialize(keyBuffer);
            console.log('Detected Signal Protocol key format');
            return { valid: true, normalizedKey: publicKey };
        }
        catch (signalError) {
            console.warn('Signal Protocol key validation failed:', signalError);
        }
        // Try Web Crypto API format (raw base64)
        try {
            const keyBuffer = Buffer.from(publicKey, 'base64');
            // Basic validation for Ed25519 (32 bytes), ECDSA P-256 (65 bytes uncompressed), or other common lengths
            if (keyBuffer.length >= 16 && keyBuffer.length <= 128) {
                console.log(`Detected Web Crypto API key format, length: ${keyBuffer.length}`);
                return { valid: true, normalizedKey: publicKey };
            }
        }
        catch (webCryptoError) {
            console.warn('Web Crypto API key validation failed:', webCryptoError);
        }
        return { valid: false, error: 'Unsupported public key format' };
    }
    catch (error) {
        console.error('Public key validation failed:', error);
        return { valid: false, error: 'Invalid public key format' };
    }
}
/**
 * Check if handle is available
 */
async function checkHandleAvailability(request, reply) {
    const { handle } = request.body;
    if (!handle) {
        return reply.status(400).send({ error: 'Handle is required' });
    }
    try {
        const existingUser = await prismaClient.user.findUnique({
            where: { handle },
        });
        if (existingUser) {
            return reply.send({ available: false, message: 'Handle is already taken.' });
        }
        else {
            return reply.send({ available: true, message: 'Handle is available.' });
        }
    }
    catch (error) {
        logger_1.logger.error('Error checking handle availability:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
}
/**
 * Create new account with collision detection
 */
async function createAccount(request, reply) {
    const { handle, publicKey } = request.body;
    try {
        // Rate limiting
        if (!checkRateLimit(request)) {
            return reply.status(429).send({
                error: 'Rate limit exceeded',
                message: 'Too many account creation attempts. Please try again later.'
            });
        }
        // Validate handle format
        const handleValidation = validateHandle(handle);
        if (!handleValidation.valid) {
            return reply.status(400).send({
                error: 'Invalid handle format',
                message: handleValidation.error
            });
        }
        // For simplicity, we'll trust the provided public key for now,
        // as the primary keys for E2EE will be the Signal keys we generate.
        // Transaction to prevent race conditions
        const result = await prismaClient.$transaction(async (tx) => {
            // Double-check handle availability within transaction
            const existingUser = await tx.user.findUnique({
                where: { handle },
                select: { handle: true }
            });
            if (existingUser) {
                throw new Error('HANDLE_COLLISION');
            }
            // Generate Signal Protocol keys
            const identityKey = await signalCrypto_1.SignalCrypto.createIdentity();
            const signedPreKey = await signalCrypto_1.SignalCrypto.createPreKey();
            const signature = await signalCrypto_1.SignalCrypto.signPreKey(signedPreKey, identityKey);
            // Create the user account and their keys
            const newUser = await tx.user.create({
                data: {
                    handle,
                    publicKey, // This is the user's public key, not the identity key
                    privateKey: '', // Will be set later
                    hashedPassword: '', // Will be set later
                    identity: {
                        create: {
                            publicKey: identityKey.publicKey,
                        },
                    },
                    signedPreKey: {
                        create: {
                            key: signedPreKey.publicKey,
                            signature,
                        },
                    },
                },
                select: {
                    id: true,
                    handle: true,
                    publicKey: true,
                    createdAt: true,
                    identity: { select: { publicKey: true } },
                    signedPreKey: { select: { key: true, signature: true } },
                }
            });
            return newUser;
        });
        return reply.status(201).send(result);
    }
    catch (error) {
        console.error('Account creation failed:', error);
        if (error instanceof Error) {
            if (error.message === 'HANDLE_COLLISION') {
                return reply.status(409).send({
                    error: 'Handle collision',
                    message: 'Handle was taken by another user during registration'
                });
            }
        }
        return reply.status(500).send({
            error: 'Account creation failed',
            message: 'Internal server error occurred during account creation'
        });
    }
}
/**
 * Get account information by handle
 */
async function getAccount(request, reply) {
    try {
        const { handle } = request.params;
        // Validate handle format
        const validation = validateHandle(handle);
        if (!validation.valid) {
            return reply.status(400).send({
                error: 'Invalid handle format',
                message: validation.error
            });
        }
        const user = await prismaClient.user.findUnique({
            where: { handle },
            select: {
                id: true,
                handle: true,
                publicKey: true,
                createdAt: true
            }
        });
        if (!user) {
            return reply.status(404).send({
                error: 'User not found',
                message: 'No user found with the specified handle'
            });
        }
        return reply.send({
            id: user.id,
            handle: user.handle,
            publicKey: user.publicKey,
            createdAt: user.createdAt
        });
    }
    catch (error) {
        console.error('Failed to get account:', error);
        return reply.status(500).send({
            error: 'Internal server error',
            message: 'Failed to retrieve account information'
        });
    }
}
/**
 * Delete account by handle (for cleanup/testing purposes)
 */
async function deleteAccount(request, reply) {
    try {
        const { handle } = request.params;
        // Validate handle format
        const validation = validateHandle(handle);
        if (!validation.valid) {
            return reply.status(400).send({
                error: 'Invalid handle format',
                message: validation.error
            });
        }
        const deletedUser = await prismaClient.user.delete({
            where: { handle },
            select: {
                id: true,
                handle: true
            }
        });
        console.log('Account deleted:', handle);
        return reply.send({
            success: true,
            deletedAccount: deletedUser,
            message: 'Account deleted successfully'
        });
    }
    catch (error) {
        console.error('Failed to delete account:', error);
        if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
            return reply.status(404).send({
                error: 'Account not found',
                message: 'No account found with the specified handle'
            });
        }
        return reply.status(500).send({
            error: 'Account deletion failed',
            message: 'Internal server error occurred during account deletion'
        });
    }
}
/**
 * Health check endpoint
 */
async function healthCheck(request, reply) {
    try {
        // Test database connection
        await prismaClient.$queryRaw `SELECT 1`;
        return reply.send({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    }
    catch (error) {
        console.error('Health check failed:', error);
        return reply.status(503).send({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected'
        });
    }
}
/**
 * Look up account by public key for recovery purposes
 */
async function lookupAccountByPublicKey(request, reply) {
    try {
        const { publicKey } = request.body;
        console.log('=== Account Lookup Debug ===');
        console.log('Received public key:', publicKey);
        console.log('Public key length:', publicKey?.length);
        if (!publicKey) {
            return reply.status(400).send({ error: 'Public key is required' });
        }
        // Validate public key format
        const keyValidation = validatePublicKey(publicKey);
        if (!keyValidation.valid) {
            console.log('Public key validation failed:', keyValidation.error);
            return reply.status(400).send({
                error: 'Invalid public key',
                message: keyValidation.error
            });
        }
        const normalizedPublicKey = keyValidation.normalizedKey || publicKey;
        console.log('Normalized public key:', normalizedPublicKey);
        // Look up user by public key
        const user = await prismaClient.user.findFirst({
            where: { publicKey: normalizedPublicKey },
            select: {
                id: true,
                handle: true,
                publicKey: true,
                createdAt: true
            }
        });
        console.log('Database lookup result:', user ? 'FOUND' : 'NOT FOUND');
        if (user) {
            console.log('Found user handle:', user.handle);
            console.log('Found user public key:', user.publicKey);
        }
        else {
            // Let's also search for any similar keys for debugging
            const allUsers = await prismaClient.user.findMany({
                select: { handle: true, publicKey: true }
            });
            console.log('Total users in database:', allUsers.length);
            if (allUsers.length > 0) {
                console.log('Sample keys in database:');
                allUsers.slice(0, 3).forEach((u, i) => {
                    console.log(`  ${i + 1}. ${u.handle}: ${u.publicKey}`);
                });
            }
        }
        if (!user) {
            return reply.status(404).send({
                error: 'Account not found',
                message: 'No account found with this public key'
            });
        }
        return reply.send({
            success: true,
            account: {
                handle: user.handle,
                publicKey: user.publicKey,
                createdAt: user.createdAt
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error looking up account by public key:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
}
//# sourceMappingURL=accounts.js.map