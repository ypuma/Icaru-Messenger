interface KeyPair {
    publicKey: string;
    privateKey: string;
}
interface SignalKeyBundle {
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
}
interface SessionKeys {
    tx: Uint8Array;
    rx: Uint8Array;
}
/**
 * Packet structure for encrypted data.
 *   c – ciphertext (base64 url-safe, no padding)
 *   n – nonce      (base64 url-safe, no padding)
 * The abbreviated property names keep payload size small and match the
 * frontend implementation so that packets can be relayed verbatim over
 * the network.
 */
interface CipherPacket {
    c: string;
    n: string;
}
/**
 * Secure E2EE implementation using libsodium best practices.
 * Uses crypto_kx for key exchange and crypto_secretbox_easy for encryption.
 * Backend implementation matching the frontend.
 */
export declare class SignalCrypto {
    /**
     * Initialize libsodium - must be called before any other operations
     */
    static initialize(): Promise<void>;
    /**
     * Generates a new key pair for crypto_kx (X25519).
     */
    static createIdentity(): Promise<KeyPair>;
    /**
     * Generates a new pre-key pair (same as identity for simplicity).
     */
    static createPreKey(): Promise<KeyPair>;
    /**
     * Signs a pre-key with the identity key using Ed25519.
     */
    static signPreKey(preKey: KeyPair, identityKey: KeyPair): Promise<string>;
    /**
     * Converts hex-encoded keys to Uint8Array format.
     */
    static convertHexToUint8Array(hexKey: string): Promise<Uint8Array>;
    /**
     * Establish a session using crypto_kx key exchange.
     * This creates separate tx/rx keys for each direction.
     */
    static buildSession(ourIdentityKey: KeyPair, theirKeyBundle: SignalKeyBundle, isClient?: boolean): Promise<SessionKeys>;
    /**
     * Encrypts a message using crypto_secretbox_easy with the tx key.
     */
    static encrypt(message: string, sessionKeys: SessionKeys): Promise<CipherPacket>;
    /**
     * Decrypts a message using crypto_secretbox_open_easy with the rx key.
     */
    static decrypt(packet: CipherPacket, sessionKeys: SessionKeys): Promise<string>;
    /**
     * Utility method to determine session role based on public keys.
     * Lower public key becomes client, higher becomes server.
     */
    static determineRole(ourPublicKey: string, theirPublicKey: string): boolean;
}
export {};
//# sourceMappingURL=signalCrypto.d.ts.map