import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import * as libsignal from '@signalapp/libsignal-client';
import { SignalCrypto } from '@/crypto/signalCrypto';

import { logger } from '@/utils/logger';


const prismaClient = new PrismaClient();

// Global flag to control rate limiting
let isRateLimitDisabled = false;

export interface CreateAccountRequest {
  handle: string;
  publicKey: string;
  qrCodeData?: string;
  preKeyBundle?: {
    registrationId: number;
    identityKey: string;
    signedPreKey: {
      keyId: number;
      publicKey: string;
      signature: string;
    };
    oneTimePreKeys: {
      keyId: number;
      publicKey: string;
    }[];
  };
}

export interface CheckHandleRequest {
  handle: string;
}

// Rate limiting tracker (in production, use Redis)
const rateLimitTracker = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

/**
 * Rate limiting middleware for account operations
 */
function checkRateLimit(request: FastifyRequest): boolean {
  if (isRateLimitDisabled) {
    logger.warn('Rate limiting is temporarily disabled.');
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
export function toggleRateLimit(shouldDisable: boolean) {
  isRateLimitDisabled = shouldDisable;
  logger.info(`Rate limiting has been ${shouldDisable ? 'disabled' : 'enabled'}.`);
}

/**
 * Validate handle format
 */
function validateHandle(handle: string): { valid: boolean; error?: string } {
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
function validatePublicKey(publicKey: string): { valid: boolean; error?: string; normalizedKey?: string } {
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
    } catch {
      // Not JSON, continue with other formats
    }
    
    // Try Signal Protocol format
    try {
      const keyBuffer = Buffer.from(publicKey, 'base64');
      libsignal.PublicKey.deserialize(keyBuffer);
      console.log('Detected Signal Protocol key format');
      return { valid: true, normalizedKey: publicKey };
    } catch (signalError) {
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
    } catch (webCryptoError) {
      console.warn('Web Crypto API key validation failed:', webCryptoError);
    }
    
    return { valid: false, error: 'Unsupported public key format' };
  } catch (error) {
    console.error('Public key validation failed:', error);
    return { valid: false, error: 'Invalid public key format' };
  }
}

/**
 * Check if handle is available
 */
export async function checkHandleAvailability(request: FastifyRequest, reply: FastifyReply) {
  const { handle } = request.body as { handle: string };
  
  if (!handle) {
    return reply.status(400).send({ error: 'Handle is required' });
  }

  try {
    const existingUser = await prismaClient.user.findUnique({
      where: { handle },
    });

    if (existingUser) {
      return reply.send({ available: false, message: 'Handle is already taken.' });
    } else {
      return reply.send({ available: true, message: 'Handle is available.' });
    }
  } catch (error) {
    logger.error('Error checking handle availability:', error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Create new account with collision detection
 */
export async function createAccount(
  request: FastifyRequest<{ Body: { handle: string, publicKey: string } }>,
  reply: FastifyReply
) {
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

    // Store the caller-supplied public key *also* as the long-term identity
    // key used for E2EE so that both client and server speak the same
    // crypto identity.  For now we simply mirror it into the Identity and
    // SignedPreKey tables so that the existing key-bundle endpoint keeps
    // working without any changes on the front-end.

    // Transaction to prevent race conditions
    const result = await prismaClient.$transaction(async (tx: any) => {
      // Double-check handle availability within transaction
      const existingUser = await tx.user.findUnique({
        where: { handle },
        select: { handle: true }
      });

      if (existingUser) {
        throw new Error('HANDLE_COLLISION');
      }

      const newUser = await tx.user.create({
        data: {
          handle,
          publicKey, // raw user public key (hex ⇢ base64)
          privateKey: '',
          hashedPassword: '',
          identity: {
            create: {
              publicKey, // SAME key – ensures symmetry
            },
          },
          signedPreKey: {
            create: {
              key: publicKey,
              signature: '', // not yet signed – will be phased in later
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
  } catch (error: any) {
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
export async function getAccount(
  request: FastifyRequest<{ Params: { handle: string } }>,
  reply: FastifyReply
) {
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
        error: 'Benutzer nicht gefunden',
        message: 'Kein Benutzer mit der Handle gefunden found with the specified handle'
      });
    }

    return reply.send({
      id: user.id,
      handle: user.handle,
      publicKey: user.publicKey,
      createdAt: user.createdAt
    });

  } catch (error) {
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
export async function deleteAccount(
  request: FastifyRequest<{ Params: { handle: string } }>,
  reply: FastifyReply
) {
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

  } catch (error) {
    console.error('Failed to delete account:', error);
    
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return reply.status(404).send({
        error: 'Konto nicht gefunden',
        message: 'Kein Konto mit der Handle gefunden'
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
export async function healthCheck(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Test database connection
    await prismaClient.$queryRaw`SELECT 1`;
    
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return reply.status(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
}

/**
 * Delete account using recovery phrase
 */
export async function deleteAccountWithRecovery(
  request: FastifyRequest<{ Body: { publicKey: string } }>,
  reply: FastifyReply
) {
  try {
    const { publicKey } = request.body;
    
    if (!publicKey) {
      return reply.status(400).send({ error: 'Public key is required' });
    }

    // Validate public key format
    const keyValidation = validatePublicKey(publicKey);
    if (!keyValidation.valid) {
      return reply.status(400).send({
        error: 'Invalid public key',
        message: keyValidation.error
      });
    }
    
    const normalizedPublicKey = keyValidation.normalizedKey || publicKey;

    // Look up user by public key first
    const user = await prismaClient.user.findFirst({
      where: { publicKey: normalizedPublicKey },
      select: {
        id: true,
        handle: true,
        publicKey: true
      }
    });

    if (!user) {
      return reply.status(404).send({ 
        error: 'Konto nicht gefunden',
        message: 'Kein Konto mit diesem öffentlichen Schlüssel gefunden'
      });
    }

    // Delete the account and all related data
    await prismaClient.$transaction(async (tx: any) => {
      await tx.user.delete({
        where: { id: user.id }
      });
    });

    logger.info(`Account deleted via recovery phrase: ${user.handle}`);
    
    return reply.send({
      success: true,
      message: 'Konto erfolgreich gelöscht',
      deletedHandle: user.handle
    });

  } catch (error) {
    logger.error('Error deleting account with recovery phrase:', error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Look up account by public key for recovery purposes
 */
export async function lookupAccountByPublicKey(
  request: FastifyRequest<{ Body: { publicKey: string } }>,
  reply: FastifyReply
) {
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
    } else {
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
        error: 'Konto nicht gefunden',
        message: 'Kein Konto mit diesem öffentlichen Schlüssel gefunden'
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

  } catch (error) {
    logger.error('Error looking up account by public key:', error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
} 