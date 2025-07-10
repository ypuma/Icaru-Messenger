import sodium from 'libsodium-wrappers';
import { toB64, fromB64 } from '../utils/base64';

// Define interfaces for our E2EE system
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

// (deprecated) legacy interface kept for historical context; do not use.
// interface EncryptedSignalMessage {
//   ciphertext: string;
//   nonce: string;
// }

interface SessionKeys {
    tx: Uint8Array; // Transmit key (for encrypting our messages)
    rx: Uint8Array; // Receive key (for decrypting their messages)
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
export class SignalCrypto {
  /**
   * Initialize libsodium - must be called before any other operations
   */
  static async initialize(): Promise<void> {
    await sodium.ready;
    console.log('[Backend] Libsodium initialized successfully');
  }

  /**
   * Generates a new key pair for crypto_kx (X25519).
   */
  static async createIdentity(): Promise<KeyPair> {
    await sodium.ready;
    console.log('[Backend] Generating new identity key pair...');
    
    const keyPair = sodium.crypto_kx_keypair();
    const publicKey = sodium.to_base64(keyPair.publicKey);
    const privateKey = sodium.to_base64(keyPair.privateKey);
    
    console.log('[Backend] Identity key pair generated:', {
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
  static async createPreKey(): Promise<KeyPair> {
    console.log('[Backend] Generating new pre-key pair...');
    return this.createIdentity();
  }

  /**
   * Signs a pre-key with the identity key using Ed25519.
   */
  static async signPreKey(preKey: KeyPair, identityKey: KeyPair): Promise<string> {
    await sodium.ready;
    console.log('[Backend] Signing pre-key with identity key...');
    
    const preKeyBytes = sodium.from_base64(preKey.publicKey);
    const identityPrivateKeyBytes = sodium.from_base64(identityKey.privateKey);
    
    // Create Ed25519 signing key from X25519 private key
    const signingKeyPair = sodium.crypto_sign_seed_keypair(identityPrivateKeyBytes.slice(0, 32));
    const signature = sodium.crypto_sign_detached(preKeyBytes, signingKeyPair.privateKey);
    
    console.log('[Backend] Pre-key signed successfully');
    return sodium.to_base64(signature);
  }

  /**
   * Converts hex-encoded keys to Uint8Array format.
   */
  static async convertHexToUint8Array(hexKey: string): Promise<Uint8Array> {
    await sodium.ready;
    return sodium.from_hex(hexKey);
  }

  /**
   * Establish a session using crypto_kx key exchange.
   * This creates separate tx/rx keys for each direction.
   */
  static async buildSession(
    ourIdentityKey: KeyPair,
    theirKeyBundle: SignalKeyBundle,
    isClient: boolean = false
  ): Promise<SessionKeys> {
    await sodium.ready;

    try {
      console.log('[Backend] Building crypto_kx session...', {
        role: isClient ? 'CLIENT' : 'SERVER',
        ourKeyLength: ourIdentityKey.privateKey.length,
        theirKeyPreview: theirKeyBundle.identityKey.slice(0, 20) + '...'
      });

      // Convert keys to Uint8Array format
      let ourPrivateKey: Uint8Array;
      let ourPublicKey: Uint8Array;
      let theirPublicKey: Uint8Array;

      // Handle different key formats (hex from account creation vs base64 from createIdentity)
      if (ourIdentityKey.privateKey.length > 50) { // Likely hex format
        console.log('[Backend] Converting hex keys to Uint8Array');
        ourPrivateKey = await this.convertHexToUint8Array(ourIdentityKey.privateKey);
        ourPublicKey = await this.convertHexToUint8Array(ourIdentityKey.publicKey);
      } else {
        console.log('[Backend] Using base64 keys directly');
        ourPrivateKey = sodium.from_base64(ourIdentityKey.privateKey);
        ourPublicKey = sodium.from_base64(ourIdentityKey.publicKey);
      }

      // Decode partner public-key (accept both URLSAFE and ORIGINAL variants)
      theirPublicKey = this.base64ToBytes(theirKeyBundle.identityKey);

      console.log('[Backend] Key sizes for crypto_kx:', {
        ourPrivateKeyLength: ourPrivateKey.length,
        ourPublicKeyLength: ourPublicKey.length,
        theirPublicKeyLength: theirPublicKey.length
      });

      // Generate session keys using crypto_kx
      let sessionKeys: { sharedRx: Uint8Array; sharedTx: Uint8Array };
      
      if (isClient) {
        // Client side: generates (rx, tx) where rx is for receiving from server, tx for sending to server
        sessionKeys = sodium.crypto_kx_client_session_keys(ourPublicKey, ourPrivateKey, theirPublicKey);
        console.log('[Backend] Generated CLIENT session keys');
      } else {
        // Server side: generates (rx, tx) where rx is for receiving from client, tx for sending to client
        sessionKeys = sodium.crypto_kx_server_session_keys(ourPublicKey, ourPrivateKey, theirPublicKey);
        console.log('[Backend] Generated SERVER session keys');
      }

      const result: SessionKeys = {
        tx: sessionKeys.sharedTx, // Key for encrypting our outgoing messages
        rx: sessionKeys.sharedRx, // Key for decrypting their incoming messages
      };

      console.log('[Backend] Session keys established:', {
        role: isClient ? 'CLIENT' : 'SERVER',
        txKeyPreview: Array.from(result.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
        rxKeyPreview: Array.from(result.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
      });

      return result;
    } catch (error) {
      console.error('[Backend] Error in buildSession:', error);
      throw new Error(`Session building failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypts a message using crypto_secretbox_easy with the tx key.
   */
  static async encrypt(
    message: string,
    sessionKeys: SessionKeys
  ): Promise<CipherPacket> {
    await sodium.ready;
    
    console.log('[Backend] Encrypting message with crypto_secretbox_easy:', {
      messageLength: message.length,
      txKeyPreview: Array.from(sessionKeys.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
    });
    
    // Generate a random nonce for this message
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    
    // Convert message to bytes
    const messageBytes = sodium.from_string(message);
    
    // Encrypt using crypto_secretbox_easy with our tx key
    const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, sessionKeys.tx);

    const result: CipherPacket = {
      c: toB64(ciphertext),
      n: toB64(nonce),
    };

    console.log('[Backend] Message encrypted successfully:', {
      ciphertextLength: result.c.length,
      nonceLength: result.n.length
    });
    
    return result;
  }

  /**
   * Decrypts a message using crypto_secretbox_open_easy with the rx key.
   */
  static async decrypt(
    packet: CipherPacket,
    sessionKeys: SessionKeys
  ): Promise<string> {
    await sodium.ready;
    
    console.log('[Backend] Decrypting message with crypto_secretbox_open_easy:', {
      ciphertextLength: packet.c.length,
      nonceLength: packet.n.length,
      rxKeyPreview: Array.from(sessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
    });
    
    const ciphertext = fromB64(packet.c);
    const nonce = fromB64(packet.n);

    try {
      // Decrypt using crypto_secretbox_open_easy with their rx key (our tx becomes their rx)
      const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, sessionKeys.rx);
      const message = sodium.to_string(decryptedBytes);
      
      console.log('[Backend] Message decrypted successfully:', {
        messageLength: message.length
      });
      
      return message;
    } catch (error) {
      console.error('[Backend] Decryption failed:', {
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
  static determineRole(ourPublicKey: string, theirPublicKey: string): boolean {
    const ourKeyBytes = sodium.from_base64(ourPublicKey);
    const theirKeyBytes = sodium.from_base64(theirPublicKey);
    
    // Compare bytes to determine who is client (lower key) vs server (higher key)
    for (let i = 0; i < Math.min(ourKeyBytes.length, theirKeyBytes.length); i++) {
      if (ourKeyBytes[i] < theirKeyBytes[i]) {
        console.log('[Backend] Role determined: CLIENT (our key is lower)');
        return true; // We are client
      } else if (ourKeyBytes[i] > theirKeyBytes[i]) {
        console.log('[Backend] Role determined: SERVER (our key is higher)');
        return false; // We are server
      }
    }
    
    // Keys are equal (very unlikely), default to client
            console.log('[Backend] Role determined: CLIENT (keys equal, defaulting)');
    return true;
  }

  /**
   * Helper identical to the frontend implementation: decode either URLSAFE or
   * ORIGINAL base64 strings (with or without padding) into raw bytes.
   */
  private static base64ToBytes(data: string): Uint8Array {
    const normalized = data.replace(/=/g, '');
    try {
      return sodium.from_base64(normalized, sodium.base64_variants.URLSAFE_NO_PADDING);
    } catch (_) {
      return sodium.from_base64(data, sodium.base64_variants.ORIGINAL);
    }
  }
} 