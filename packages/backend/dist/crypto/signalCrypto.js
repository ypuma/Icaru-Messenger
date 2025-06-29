"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalCrypto = void 0;
const libsodium_wrappers_1 = __importDefault(require("libsodium-wrappers"));
const base64_1 = require("../utils/base64");
/**
 * Secure E2EE implementation using libsodium best practices.
 * Uses crypto_kx for key exchange and crypto_secretbox_easy for encryption.
 * Backend implementation matching the frontend.
 */
class SignalCrypto {
    /**
     * Initialize libsodium - must be called before any other operations
     */
    static async initialize() {
        await libsodium_wrappers_1.default.ready;
        console.log('🔐 [Backend] Libsodium initialized successfully');
    }
    /**
     * Generates a new key pair for crypto_kx (X25519).
     */
    static async createIdentity() {
        await libsodium_wrappers_1.default.ready;
        console.log('🔑 [Backend] Generating new identity key pair...');
        const keyPair = libsodium_wrappers_1.default.crypto_kx_keypair();
        const publicKey = libsodium_wrappers_1.default.to_base64(keyPair.publicKey);
        const privateKey = libsodium_wrappers_1.default.to_base64(keyPair.privateKey);
        console.log('✅ [Backend] Identity key pair generated:', {
            publicKeyPreview: publicKey.slice(0, 16) + '...',
            privateKeyLength: privateKey.length
        });
        return {
            publicKey,
            privateKey,
        };
    }
    /**
     * Generates a new pre-key pair (same as identity for simplicity).
     */
    static async createPreKey() {
        console.log('🔑 [Backend] Generating new pre-key pair...');
        return this.createIdentity();
    }
    /**
     * Signs a pre-key with the identity key using Ed25519.
     */
    static async signPreKey(preKey, identityKey) {
        await libsodium_wrappers_1.default.ready;
        console.log('✍️ [Backend] Signing pre-key with identity key...');
        const preKeyBytes = libsodium_wrappers_1.default.from_base64(preKey.publicKey);
        const identityPrivateKeyBytes = libsodium_wrappers_1.default.from_base64(identityKey.privateKey);
        // Create Ed25519 signing key from X25519 private key
        const signingKeyPair = libsodium_wrappers_1.default.crypto_sign_seed_keypair(identityPrivateKeyBytes.slice(0, 32));
        const signature = libsodium_wrappers_1.default.crypto_sign_detached(preKeyBytes, signingKeyPair.privateKey);
        console.log('✅ [Backend] Pre-key signed successfully');
        return libsodium_wrappers_1.default.to_base64(signature);
    }
    /**
     * Converts hex-encoded keys to Uint8Array format.
     */
    static async convertHexToUint8Array(hexKey) {
        await libsodium_wrappers_1.default.ready;
        return libsodium_wrappers_1.default.from_hex(hexKey);
    }
    /**
     * Establish a session using crypto_kx key exchange.
     * This creates separate tx/rx keys for each direction.
     */
    static async buildSession(ourIdentityKey, theirKeyBundle, isClient = false) {
        await libsodium_wrappers_1.default.ready;
        try {
            console.log('🔗 [Backend] Building crypto_kx session...', {
                role: isClient ? 'CLIENT' : 'SERVER',
                ourKeyLength: ourIdentityKey.privateKey.length,
                theirKeyPreview: theirKeyBundle.identityKey.slice(0, 20) + '...'
            });
            // Convert keys to Uint8Array format
            let ourPrivateKey;
            let ourPublicKey;
            let theirPublicKey;
            // Handle different key formats (hex from account creation vs base64 from createIdentity)
            if (ourIdentityKey.privateKey.length > 50) { // Likely hex format
                console.log('🔄 [Backend] Converting hex keys to Uint8Array');
                ourPrivateKey = await this.convertHexToUint8Array(ourIdentityKey.privateKey);
                ourPublicKey = await this.convertHexToUint8Array(ourIdentityKey.publicKey);
            }
            else {
                console.log('🔄 [Backend] Using base64 keys directly');
                ourPrivateKey = libsodium_wrappers_1.default.from_base64(ourIdentityKey.privateKey);
                ourPublicKey = libsodium_wrappers_1.default.from_base64(ourIdentityKey.publicKey);
            }
            theirPublicKey = libsodium_wrappers_1.default.from_base64(theirKeyBundle.identityKey);
            console.log('🔧 [Backend] Key sizes for crypto_kx:', {
                ourPrivateKeyLength: ourPrivateKey.length,
                ourPublicKeyLength: ourPublicKey.length,
                theirPublicKeyLength: theirPublicKey.length
            });
            // Generate session keys using crypto_kx
            let sessionKeys;
            if (isClient) {
                // Client side: generates (rx, tx) where rx is for receiving from server, tx for sending to server
                sessionKeys = libsodium_wrappers_1.default.crypto_kx_client_session_keys(ourPublicKey, ourPrivateKey, theirPublicKey);
                console.log('🔑 [Backend] Generated CLIENT session keys');
            }
            else {
                // Server side: generates (rx, tx) where rx is for receiving from client, tx for sending to client
                sessionKeys = libsodium_wrappers_1.default.crypto_kx_server_session_keys(ourPublicKey, ourPrivateKey, theirPublicKey);
                console.log('🔑 [Backend] Generated SERVER session keys');
            }
            const result = {
                tx: sessionKeys.sharedTx, // Key for encrypting our outgoing messages
                rx: sessionKeys.sharedRx, // Key for decrypting their incoming messages
            };
            console.log('✅ [Backend] Session keys established:', {
                role: isClient ? 'CLIENT' : 'SERVER',
                txKeyPreview: Array.from(result.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
                rxKeyPreview: Array.from(result.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
            });
            return result;
        }
        catch (error) {
            console.error('❌ [Backend] Error in buildSession:', error);
            throw new Error(`Session building failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Encrypts a message using crypto_secretbox_easy with the tx key.
     */
    static async encrypt(message, sessionKeys) {
        await libsodium_wrappers_1.default.ready;
        console.log('🔒 [Backend] Encrypting message with crypto_secretbox_easy:', {
            messageLength: message.length,
            txKeyPreview: Array.from(sessionKeys.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
        });
        // Generate a random nonce for this message
        const nonce = libsodium_wrappers_1.default.randombytes_buf(libsodium_wrappers_1.default.crypto_secretbox_NONCEBYTES);
        // Convert message to bytes
        const messageBytes = libsodium_wrappers_1.default.from_string(message);
        // Encrypt using crypto_secretbox_easy with our tx key
        const ciphertext = libsodium_wrappers_1.default.crypto_secretbox_easy(messageBytes, nonce, sessionKeys.tx);
        const result = {
            c: (0, base64_1.toB64)(ciphertext),
            n: (0, base64_1.toB64)(nonce),
        };
        console.log('✅ [Backend] Message encrypted successfully:', {
            ciphertextLength: result.c.length,
            nonceLength: result.n.length
        });
        return result;
    }
    /**
     * Decrypts a message using crypto_secretbox_open_easy with the rx key.
     */
    static async decrypt(packet, sessionKeys) {
        await libsodium_wrappers_1.default.ready;
        console.log('🔓 [Backend] Decrypting message with crypto_secretbox_open_easy:', {
            ciphertextLength: packet.c.length,
            nonceLength: packet.n.length,
            rxKeyPreview: Array.from(sessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
        });
        const ciphertext = (0, base64_1.fromB64)(packet.c);
        const nonce = (0, base64_1.fromB64)(packet.n);
        try {
            // Decrypt using crypto_secretbox_open_easy with their rx key (our tx becomes their rx)
            const decryptedBytes = libsodium_wrappers_1.default.crypto_secretbox_open_easy(ciphertext, nonce, sessionKeys.rx);
            const message = libsodium_wrappers_1.default.to_string(decryptedBytes);
            console.log('✅ [Backend] Message decrypted successfully:', {
                messageLength: message.length
            });
            return message;
        }
        catch (error) {
            console.error('❌ [Backend] Decryption failed:', {
                rxKeyPreview: Array.from(sessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
                error: error
            });
            throw new Error('Failed to decrypt message: Invalid ciphertext or wrong key');
        }
    }
    /**
     * Utility method to determine session role based on public keys.
     * Lower public key becomes client, higher becomes server.
     */
    static determineRole(ourPublicKey, theirPublicKey) {
        const ourKeyBytes = libsodium_wrappers_1.default.from_base64(ourPublicKey);
        const theirKeyBytes = libsodium_wrappers_1.default.from_base64(theirPublicKey);
        // Compare bytes to determine who is client (lower key) vs server (higher key)
        for (let i = 0; i < Math.min(ourKeyBytes.length, theirKeyBytes.length); i++) {
            if (ourKeyBytes[i] < theirKeyBytes[i]) {
                console.log('🎭 [Backend] Role determined: CLIENT (our key is lower)');
                return true; // We are client
            }
            else if (ourKeyBytes[i] > theirKeyBytes[i]) {
                console.log('🎭 [Backend] Role determined: SERVER (our key is higher)');
                return false; // We are server
            }
        }
        // Keys are equal (very unlikely), default to client
        console.log('🎭 [Backend] Role determined: CLIENT (keys equal, defaulting)');
        return true;
    }
}
exports.SignalCrypto = SignalCrypto;
//# sourceMappingURL=signalCrypto.js.map