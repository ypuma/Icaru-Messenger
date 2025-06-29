/**
 * Generate a secure session token
 */
export declare const generateSessionToken: () => string;
/**
 * Generate a secure API key
 */
export declare const generateApiKey: () => string;
/**
 * Generate a secure handle (6 character alphanumeric)
 */
export declare const generateHandle: () => string;
/**
 * Generate a secure device ID
 */
export declare const generateDeviceId: () => string;
/**
 * Hash a password with salt
 */
export declare const hashPassword: (password: string) => Promise<string>;
/**
 * Verify a password against a hash
 */
export declare const verifyPassword: (password: string, hash: string) => Promise<boolean>;
//# sourceMappingURL=auth.d.ts.map