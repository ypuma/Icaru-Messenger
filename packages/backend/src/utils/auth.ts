import crypto from 'crypto';

/**
 * Generate a secure session token
 */
export const generateSessionToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate a secure API key
 */
export const generateApiKey = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * Generate a secure handle (6 character alphanumeric)
 */
export const generateHandle = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate a secure device ID
 */
export const generateDeviceId = (): string => {
  return crypto.randomUUID();
};

/**
 * Hash a password with salt
 */
export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 12);
};

/**
 * Verify a password against a hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(password, hash);
}; 