import { FastifyRequest, FastifyReply } from 'fastify';
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
/**
 * Toggles the rate limit on or off.
 */
export declare function toggleRateLimit(shouldDisable: boolean): void;
/**
 * Check if handle is available
 */
export declare function checkHandleAvailability(request: FastifyRequest, reply: FastifyReply): Promise<never>;
/**
 * Create new account with collision detection
 */
export declare function createAccount(request: FastifyRequest<{
    Body: {
        handle: string;
        publicKey: string;
    };
}>, reply: FastifyReply): Promise<never>;
/**
 * Get account information by handle
 */
export declare function getAccount(request: FastifyRequest<{
    Params: {
        handle: string;
    };
}>, reply: FastifyReply): Promise<never>;
/**
 * Delete account by handle (for cleanup/testing purposes)
 */
export declare function deleteAccount(request: FastifyRequest<{
    Params: {
        handle: string;
    };
}>, reply: FastifyReply): Promise<never>;
/**
 * Health check endpoint
 */
export declare function healthCheck(request: FastifyRequest, reply: FastifyReply): Promise<never>;
/**
 * Look up account by public key for recovery purposes
 */
export declare function lookupAccountByPublicKey(request: FastifyRequest<{
    Body: {
        publicKey: string;
    };
}>, reply: FastifyReply): Promise<never>;
//# sourceMappingURL=accounts.d.ts.map