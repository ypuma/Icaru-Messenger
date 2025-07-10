import crypto from 'crypto';


export const generateSessionToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};


export const generateApiKey = (): string => {
  return crypto.randomBytes(64).toString('hex');
};


export const generateHandle = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};


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