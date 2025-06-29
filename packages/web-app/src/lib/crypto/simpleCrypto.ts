export interface IdentityKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Simplified Crypto Operations using Web Crypto API
 * For development purposes only - production should use Signal Protocol
 */
export class SimpleCrypto {
  private static instance: SimpleCrypto;

  static getInstance(): SimpleCrypto {
    if (!SimpleCrypto.instance) {
      SimpleCrypto.instance = new SimpleCrypto();
    }
    return SimpleCrypto.instance;
  }

  /**
   * Generate Ed25519 key pair using Web Crypto API
   */
  async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519'
        },
        true,
        ['sign', 'verify']
      );

      const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      return {
        publicKey: Buffer.from(publicKeyRaw).toString('base64'),
        privateKey: Buffer.from(privateKeyRaw).toString('base64')
      };
    } catch (error) {
      console.error('Failed to generate Ed25519 key pair:', error);
      // Fallback to ECDSA if Ed25519 is not supported
      try {
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          true,
          ['sign', 'verify']
        );

        const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        return {
          publicKey: Buffer.from(publicKeyRaw).toString('base64'),
          privateKey: Buffer.from(privateKeyRaw).toString('base64')
        };
      } catch (fallbackError) {
        console.error('Both Ed25519 and ECDSA key generation failed:', fallbackError);
        throw new Error('Failed to generate cryptographic keys');
      }
    }
  }

  /**
   * Generate cryptographically secure random bytes
   */
  generateSecureRandom(length: number): Uint8Array {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return array;
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKey(password: string, salt: Uint8Array, iterations: number = 100000): Promise<Uint8Array> {
    try {
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(password);
      
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );
      
      const derivedKey = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: iterations,
          hash: 'SHA-256'
        },
        keyMaterial,
        256 // 32 bytes
      );
      
      return new Uint8Array(derivedKey);
    } catch (error) {
      console.error('Key derivation failed:', error);
      throw new Error('Failed to derive key from password');
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encryptAES(data: Uint8Array, key: Uint8Array): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    try {
      const iv = this.generateSecureRandom(12); // 12 bytes for GCM
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        cryptoKey,
        data
      );
      
      return {
        ciphertext: new Uint8Array(encrypted),
        iv: iv
      };
    } catch (error) {
      console.error('AES encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decryptAES(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        cryptoKey,
        ciphertext
      );
      
      return new Uint8Array(decrypted);
    } catch (error) {
      console.error('AES decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }
}

export const simpleCrypto = SimpleCrypto.getInstance(); 