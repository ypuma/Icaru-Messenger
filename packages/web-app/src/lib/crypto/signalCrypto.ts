import sodium from 'libsodium-wrappers';
import { toB64, fromB64 } from '../utils/base64';
import { PerfectForwardSecrecy } from './perfectForwardSecrecy';
import type { RatchetState, EphemeralKeys } from '@secure-messenger/shared';

// Define interfaces for our E2EE system
interface KeyPair {
  publicKey: string;
  privateKey: string;
}

interface SignalKeyBundle {
  identityKey: string;
  signedPreKey: {
    key: string;
    signature: string;
  };
}

interface CipherPacket {
  n: string; // nonce (base64 urlsafe no padding)
  c: string; // ciphertext (base64 urlsafe no padding)
  messageNumber?: number; // For PFS message ordering
  previousChainLength?: number; // For PFS chain management
}

interface SessionKeys {
  tx: Uint8Array; // Transmit key (for encrypting our messages)
  rx: Uint8Array; // Receive key (for decrypting their messages)
}

export interface Session {
  keys: SessionKeys;
  role: 'CLIENT' | 'SERVER';
}

/**
 * Secure E2EE implementation using libsodium best practices.
 * Uses crypto_kx for key exchange and crypto_secretbox_easy for encryption.
 */
export class SignalCrypto {
  /**
   * Initialize libsodium - must be called before any other operations
   */
  static async initialize(): Promise<void> {
    await sodium.ready;
    await PerfectForwardSecrecy.initialize();
    console.log('🔐 Libsodium and PFS initialized successfully');
  }

  /**
   * Generates a new key pair for crypto_kx (X25519).
   */
  static async createIdentity(): Promise<KeyPair> {
    await sodium.ready;
    console.log('🔑 Generating new identity key pair...');
    
    const keyPair = sodium.crypto_kx_keypair();
    const publicKey = sodium.to_base64(keyPair.publicKey);
    const privateKey = sodium.to_base64(keyPair.privateKey);
    
    console.log('✅ Identity key pair generated:', {
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
    console.log('🔑 Generating new pre-key pair...');
    return this.createIdentity();
  }

  /**
   * Signs a pre-key with the identity key using Ed25519.
   */
  static async signPreKey(preKey: KeyPair, identityKey: KeyPair): Promise<string> {
    await sodium.ready;
    console.log('✍️ Signing pre-key with identity key...');
    
    const preKeyBytes = sodium.from_base64(preKey.publicKey);
    const identityPrivateKeyBytes = sodium.from_base64(identityKey.privateKey);
    
    // Create Ed25519 signing key from X25519 private key
    const signingKeyPair = sodium.crypto_sign_seed_keypair(identityPrivateKeyBytes.slice(0, 32));
    const signature = sodium.crypto_sign_detached(preKeyBytes, signingKeyPair.privateKey);
    
    console.log('✅ Pre-key signed successfully');
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
    isClient: boolean = true
  ): Promise<SessionKeys> {
    await sodium.ready;

    try {
      console.log('🔗 Building crypto_kx session...', {
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
        console.log('🔄 Converting hex keys to Uint8Array');
        ourPrivateKey = await this.convertHexToUint8Array(ourIdentityKey.privateKey);
        ourPublicKey = await this.convertHexToUint8Array(ourIdentityKey.publicKey);
        theirPublicKey = this.base64ToBytes(theirKeyBundle.identityKey);
      } else {
        console.log('🔄 Using base64 keys directly');
        ourPrivateKey = this.base64ToBytes(ourIdentityKey.privateKey);
        ourPublicKey = this.base64ToBytes(ourIdentityKey.publicKey);
        theirPublicKey = this.base64ToBytes(theirKeyBundle.identityKey);
      }

      console.log('🔧 Key sizes for crypto_kx:', {
        ourPrivateKeyLength: ourPrivateKey.length,
        ourPublicKeyLength: ourPublicKey.length,
        theirPublicKeyLength: theirPublicKey.length
      });

      // Generate session keys using crypto_kx
      let sessionKeys: { sharedRx: Uint8Array; sharedTx: Uint8Array };
      
      if (isClient) {
        // Client side: generates (rx, tx) where rx is for receiving from server, tx for sending to server
        sessionKeys = sodium.crypto_kx_client_session_keys(ourPublicKey, ourPrivateKey, theirPublicKey);
        console.log('🔑 Generated CLIENT session keys');
      } else {
        // Server side: generates (rx, tx) where rx is for receiving from client, tx for sending to client
        sessionKeys = sodium.crypto_kx_server_session_keys(ourPublicKey, ourPrivateKey, theirPublicKey);
        console.log('🔑 Generated SERVER session keys');
      }

      const result: SessionKeys = {
        tx: sessionKeys.sharedTx, // Key for encrypting our outgoing messages
        rx: sessionKeys.sharedRx, // Key for decrypting their incoming messages
      };

      console.log('✅ Session keys established:', {
        role: isClient ? 'CLIENT' : 'SERVER',
        txKeyPreview: Array.from(result.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
        rxKeyPreview: Array.from(result.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
      });

      return result;
    } catch (error) {
      console.error('❌ Error in buildSession:', error);
      throw new Error(`Session building failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Establishes a session by fetching the partner's key bundle and deriving session keys.
   */
  static async establishSessionWithUser(
    ourIdentityKey: KeyPair,
    partnerHandle: string,
    authToken: string,
    isClient?: boolean
  ): Promise<Session> {
    console.log('🔄 Establishing session with:', partnerHandle);
    
    const response = await fetch(`http://0.0.0.0:11401/api/keys/bundle/${encodeURIComponent(partnerHandle)}`, {
      headers: { 
        'Authorization': `Bearer ${authToken}`,
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch key bundle: ${response.status} ${errorText}`);
    }
    
    const theirKeyBundle: SignalKeyBundle = await response.json();
    console.log('📦 Key bundle received:', {
      partnerHandle,
      identityKey: theirKeyBundle.identityKey.slice(0, 20) + '...',
      signedPreKey: theirKeyBundle.signedPreKey.key.slice(0, 20) + '...'
    });
    
    // If caller already decided the role, respect it; otherwise decide here (legacy)
    let role: 'CLIENT' | 'SERVER';
    if (typeof isClient !== 'undefined') {
      role = isClient ? 'CLIENT' : 'SERVER';
    } else {
      role = this.determineRole(ourIdentityKey.publicKey, theirKeyBundle.identityKey) ? 'CLIENT' : 'SERVER';
    }
    
    const sessionKeys = await this.buildSession(ourIdentityKey, theirKeyBundle, role === 'CLIENT');
    
    const session: Session = {
      keys: sessionKeys,
      role: role
    };

    console.log('🔑 Session established:', {
      partnerHandle,
      role: session.role
    });
    
    return session;
  }

  /**
   * Encrypts a message using crypto_secretbox_easy with the tx key.
   */
  static async encrypt(
    message: string,
    sessionKeys: SessionKeys
  ): Promise<CipherPacket> {
    await sodium.ready;
    
    console.log('🔒 Encrypting message with crypto_secretbox_easy:', {
      messageLength: message.length,
      txKeyPreview: Array.from(sessionKeys.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
    });
    
    // Generate a random nonce for this message
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES); // 24 bytes
    
    // Convert message to bytes
    const messageBytes = sodium.from_string(message);
    
    // Encrypt using crypto_secretbox_easy with our tx key
    const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, sessionKeys.tx);

    const result: CipherPacket = {
      c: toB64(ciphertext),
      n: toB64(nonce),
    };

    console.log('✅ Message encrypted successfully:', {
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
    
    const cipherStr = packet.c;
    const nonceStr  = packet.n;

    console.log('🔓 Decrypting message with crypto_secretbox_open_easy:', {
      ciphertextLength: cipherStr.length,
      nonceLength: nonceStr.length,
      rxKeyPreview: Array.from(sessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
    });
    
    const ciphertext = fromB64(cipherStr);
    const nonce = fromB64(nonceStr);

    if (nonce.length !== sodium.crypto_secretbox_NONCEBYTES) {
      throw new Error(`Nonce must be ${sodium.crypto_secretbox_NONCEBYTES} bytes, got ${nonce.length}`);
    }

    try {
      // Decrypt using crypto_secretbox_open_easy with their rx key (our tx becomes their rx)
      const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, sessionKeys.rx);
      const message = sodium.to_string(decryptedBytes);
      
      console.log('✅ Message decrypted successfully:', {
        messageLength: message.length
      });
      
      return message;
    } catch (error) {
      console.error('❌ Decryption failed:', {
        rxKeyPreview: Array.from(sessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
        error: error
      });
      throw new Error('Failed to decrypt message: Invalid ciphertext or wrong key');
    }
  }

  /**
   * Determine the session role (client/server) using a stable ordering of
   * the two identity public-keys.
   *
   * The rule is simple: the party whose public-key is lexicographically lower
   * (as raw bytes) takes the CLIENT role; the other takes SERVER.  This gives
   * a deterministic, independent decision for both parties.
   *
   * Both hex-encoded and base64-encoded inputs are accepted.  For hex strings
   * we convert to bytes manually; for anything else we assume standard
   * libsodium base64.
   */
  static determineRole(ourPublicKey: string, theirPublicKey: string): boolean {
    const toBytes = (key: string): Uint8Array => {
      // Detect hex: only 0-9 or a-f characters and even length (32 bytes -> 64 hex)
      const isHex = /^[0-9a-fA-F]+$/.test(key) && key.length % 2 === 0;
      if (isHex) {
        const bytes = new Uint8Array(key.length / 2);
        for (let i = 0; i < key.length; i += 2) {
          bytes[i / 2] = parseInt(key.substr(i, 2), 16);
        }
        return bytes;
      }

      // Fallback to base64 parsing (handles both standard and URL-safe w/ or w/o padding)
      try {
        // First try URLSAFE without padding (default output of sodium.to_base64 in this codebase)
        return sodium.from_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING);
      } catch (_) {
        // If that fails, attempt original (+/ with optional padding)
        return sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
      }
    };

    const ourKeyBytes = toBytes(ourPublicKey);
    const theirKeyBytes = toBytes(theirPublicKey);

    // Compare byte-by-byte
    for (let i = 0; i < Math.min(ourKeyBytes.length, theirKeyBytes.length); i++) {
      if (ourKeyBytes[i] !== theirKeyBytes[i]) {
        const role = ourKeyBytes[i] < theirKeyBytes[i] ? 'CLIENT' : 'SERVER';
        console.log(
          '🎭 Determining role - diff at index',
          i,
          {
            ourByte: ourKeyBytes[i],
            theirByte: theirKeyBytes[i],
            role,
          }
        );
        return role === 'CLIENT';
      }
    }
    // Keys identical (extremely unlikely) – default to CLIENT
    console.log('🎭 Role determined: CLIENT (keys identical)');
    return true;
  }

  private static base64ToBytes(data: string): Uint8Array {
    // Normalize padding
    const normalized = data.replace(/=/g, '');
    try {
      // First try URLSAFE (default output of sodium.to_base64)
      return sodium.from_base64(normalized, sodium.base64_variants.URLSAFE_NO_PADDING);
    } catch (_) {
      // Fallback to ORIGINAL (includes + / and optional padding)
      return sodium.from_base64(data, sodium.base64_variants.ORIGINAL);
    }
  }

  // Perfect Forward Secrecy Methods

  /**
   * Initializes a new ratchet state from the session keys.
   * The role determines how the initial chain keys are assigned.
   */
  static async initializeRatchet(session: Session): Promise<RatchetState> {
    // Combine tx and rx to create a master session key for the KDF.
    // The order MUST be deterministic. The CLIENT concatenates (tx, rx)
    // and the SERVER concatenates (rx, tx). Since the client's tx is the
    // server's rx and vice-versa, both sides will produce the IDENTICAL
    // combined key.
    const combinedKey = new Uint8Array(64);
    if (session.role === 'CLIENT') {
      // Order for CLIENT: [tx, rx]
      combinedKey.set(session.keys.tx, 0);
      combinedKey.set(session.keys.rx, 32);
      console.log('🔄 Initializing ratchet as CLIENT, key order: tx, rx');
    } else { // SERVER
      // Order for SERVER: [rx, tx]
      combinedKey.set(session.keys.rx, 0);
      combinedKey.set(session.keys.tx, 32);
      console.log('🔄 Initializing ratchet as SERVER, key order: rx, tx');
    }
    
    // Use a hash of the combined key as the true session key for PFS initialization.
    // This key is now identical for both parties.
    const sessionKey = sodium.crypto_generichash(32, combinedKey);
    
    // Initialize the base ratchet state. This state is now IDENTICAL for both parties.
    const baseRatchetState = await PerfectForwardSecrecy.initializeRatchet(sessionKey);
    
    // The role determines which chain is for sending and which for receiving
    // to ensure they are mirrored between the two parties.
    const initialState: RatchetState = {
      ...baseRatchetState,
      sendingChainKey: session.role === 'CLIENT' ? baseRatchetState.sendingChainKey : baseRatchetState.receivingChainKey,
      receivingChainKey: session.role === 'CLIENT' ? baseRatchetState.receivingChainKey : baseRatchetState.sendingChainKey,
    };
    
    // Securely wipe the intermediate keys from memory
    PerfectForwardSecrecy.zeroizeKey(sessionKey);
    PerfectForwardSecrecy.zeroizeKey(combinedKey);
    
    console.log('🔄 Ratchet state initialized for PFS');
    return initialState;
  }

  /**
   * Derive ephemeral keys from chain key
   */
  static async deriveMessageKeys(chainKey: Uint8Array): Promise<EphemeralKeys> {
    return await PerfectForwardSecrecy.deriveMessageKeys(chainKey);
  }

  /**
   * Advance the ratchet chain for the next message
   */
  static async advanceChain(ratchetState: RatchetState): Promise<RatchetState> {
    return await PerfectForwardSecrecy.advanceChain(ratchetState);
  }

  /**
   * Rotate keys based on configurable interval
   */
  static async rotateKeys(ratchetState: RatchetState, interval: number = 100): Promise<RatchetState> {
    return await PerfectForwardSecrecy.rotateKeys(ratchetState, interval);
  }

  /**
   * Encrypt a message with perfect forward secrecy
   */
  static async encryptWithPFS(
    message: string,
    ratchetState: RatchetState
  ): Promise<{ cipherPacket: CipherPacket; newRatchetState: RatchetState }> {
    const result = await PerfectForwardSecrecy.encryptWithPFS(message, ratchetState);
    
    console.log('🔒 Message encrypted with PFS:', {
      messageNumber: result.cipherPacket.messageNumber,
      previousChainLength: result.cipherPacket.previousChainLength
    });
    
    return result;
  }

  /**
   * Decrypt a message with perfect forward secrecy
   */
  static async decryptWithPFS(
    cipherPacket: CipherPacket,
    ratchetState: RatchetState
  ): Promise<{ message: string; newRatchetState: RatchetState }> {
    const result = await PerfectForwardSecrecy.decryptWithPFS(cipherPacket, ratchetState);
    
    console.log('🔓 Message decrypted with PFS:', {
      messageNumber: cipherPacket.messageNumber,
      messageLength: result.message.length
    });
    
    return result;
  }

  /**
   * Clean up old message keys to prevent memory bloat
   */
  static cleanupOldKeys(ratchetState: RatchetState, maxAge: number = 50): RatchetState {
    return PerfectForwardSecrecy.cleanupOldKeys(ratchetState, maxAge);
  }

  /**
   * Securely zero out sensitive key material
   */
  static zeroizeMemory(data: unknown): void {
    if (data instanceof Uint8Array) {
      PerfectForwardSecrecy.zeroizeKey(data);
    } else if (typeof data === 'object' && data !== null) {
      // Handle RatchetState or other objects with key material
      if ('rootKey' in data && 'sendingChainKey' in data) {
        PerfectForwardSecrecy.zeroizeRatchetState(data as RatchetState);
      }
    }
  }

  /**
   * Legacy encrypt method - now initializes PFS if ratchet state is provided
   */
  static async encryptWithRatchet(
    message: string,
    sessionKeys: SessionKeys,
    ratchetState?: RatchetState
  ): Promise<{ cipherPacket: CipherPacket; newRatchetState?: RatchetState }> {
    if (ratchetState) {
      return await this.encryptWithPFS(message, ratchetState);
    } else {
      const packet = await this.encrypt(message, sessionKeys);
      return { cipherPacket: packet };
    }
  }

  /**
   * Legacy decrypt method - now handles PFS if ratchet state is provided
   */
  static async decryptWithRatchet(
    packet: CipherPacket,
    sessionKeys: SessionKeys,
    ratchetState?: RatchetState
  ): Promise<{ message: string; newRatchetState?: RatchetState }> {
    if (ratchetState && packet.messageNumber !== undefined) {
      return await this.decryptWithPFS(packet, ratchetState);
    } else {
      const message = await this.decrypt(packet, sessionKeys);
      return { message };
    }
  }
} 