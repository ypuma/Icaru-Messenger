import { Buffer } from 'buffer';

// Ensure the global Buffer is available for libsignal
(globalThis as { Buffer: unknown }).Buffer = Buffer;

// Dynamic import to avoid build issues
const libsignal: unknown = null;

export interface IdentityKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Simplified Crypto Operations using libsignal-client
 */
export class SimplifiedCrypto {
  private static instance: SimplifiedCrypto;
  private signalAvailable = false;

  static getInstance(): SimplifiedCrypto {
    if (!SimplifiedCrypto.instance) {
      SimplifiedCrypto.instance = new SimplifiedCrypto();
    }
    return SimplifiedCrypto.instance;
  }

  constructor() {
    this.initializeSignal();
  }

  /**
   * Try to initialize Signal Protocol library
   */
  private async initializeSignal() {
    if (libsignal && (libsignal as any).IdentityKeyPair) {
      this.signalAvailable = true;
      console.log('Signal Protocol library loaded successfully');
    } else {
      console.warn('Signal Protocol library not available, using fallback Web Crypto API');
    }
  }

  /**
   * Generate Ed25519 identity key pair using libsignal-client or fallback
   */
  async generateIdentityKeyPair(): Promise<{ identityKeyPair: any; registrationId: number }> {
    await this.initializeSignal(); // Ensure check is performed
    if (this.signalAvailable) {
      console.log('Using Signal Protocol for key generation');
      const identityKeyPair = await (libsignal as any).IdentityKeyPair.generate();
      const registrationId = (libsignal as any).KeyHelper.generateRegistrationId();
      return { identityKeyPair, registrationId };
    }

    // Fallback to Web Crypto API
    console.log('Using Web Crypto API for identity key generation');
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' }, true, ['sign', 'verify']
    ) as CryptoKeyPair;
    const registrationId = Math.floor(Math.random() * 16384);
    return {
      identityKeyPair: {
        pubKey: Buffer.from(await crypto.subtle.exportKey('raw', keyPair.publicKey)).toString('base64'),
        privKey: Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64'),
      },
      registrationId,
    };
  }

  /**
   * Generate PreKey bundle using libsignal-client or fallback
   */
  async generatePreKeyBundle(identityKeyPair: any, registrationId: number): Promise<any> {
    await this.initializeSignal(); // Ensure check is performed
    if (this.signalAvailable) {
      console.log('Using Signal Protocol for pre-key bundle generation');
      try {
        const preKey = await (libsignal as any).PreKey.generate(registrationId + 1);
        const signedPreKey = await (libsignal as any).SignedPreKey.generate(identityKeyPair, registrationId + 1);
        const signature = await identityKeyPair.sign(signedPreKey.getPublicKey().serialize());
        signedPreKey.setSignature(signature);
        
        // Generate multiple one-time pre-keys
        const oneTimePreKeys = await Promise.all(
          Array.from({ length: 10 }, (_, i) => (libsignal as any).PreKey.generate(registrationId + 2 + i))
        );

        return {
          identityKey: identityKeyPair.getPublicKey().serialize(),
          registrationId,
          preKey: { keyId: preKey.getId(), publicKey: preKey.getPublicKey().serialize() },
          signedPreKey: {
            keyId: signedPreKey.getId(),
            publicKey: signedPreKey.getPublicKey().serialize(),
            signature: signedPreKey.getSignature(),
          },
          oneTimePreKeys: oneTimePreKeys.map(p => ({
            keyId: p.getId(),
            publicKey: p.getPublicKey().serialize()
          })),
        };
      } catch {
        // Fallback is handled below
      }
    }

    // Fallback to Web Crypto API
    console.log('Using Web Crypto API for pre-key bundle generation');
    const preKeyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const signedPreKeyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      Buffer.from(identityKeyPair.privKey, 'base64'), // Decode from base64 before importing
      { name: 'Ed25519' },
      true,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'Ed25519',
      privateKey,
      await crypto.subtle.exportKey('raw', signedPreKeyPair.publicKey)
    );

    // Generate multiple one-time pre-keys for fallback
    const oneTimePreKeys = await Promise.all(
      Array.from({ length: 10 }).map(async (_, i) => {
        const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
        return {
          keyId: Math.floor(Math.random() * 100000) + i,
          publicKey: Buffer.from(await crypto.subtle.exportKey('raw', key.publicKey)).toString('base64'),
        };
      })
    );

    return {
      identityKey: identityKeyPair.pubKey,
      registrationId,
      preKey: {
        keyId: Math.floor(Math.random() * 100000),
        publicKey: Buffer.from(await crypto.subtle.exportKey('raw', preKeyPair.publicKey)).toString('base64'),
      },
      signedPreKey: {
        keyId: Math.floor(Math.random() * 100000),
        publicKey: Buffer.from(await crypto.subtle.exportKey('raw', signedPreKeyPair.publicKey)).toString('base64'),
        signature: Buffer.from(signature).toString('base64'),
      },
      oneTimePreKeys,
    };
  }

  /**
   * Validate public key format (is it valid base64?)
   */
  validatePublicKey(publicKey: string): boolean {
    try {
      Buffer.from(publicKey, 'base64');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate secure random bytes
   */
  generateSecureRandom(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Generate nonce for QR codes
   */
  generateSecureNonce(): string {
    return this.bufferToHex(this.generateSecureRandom(16));
  }

  /**
   * Convert buffer to hex string
   */
  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  generateChallenge(): string {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return Buffer.from(randomBytes).toString('hex');
  }

  async sign(privateKey: string, data: string): Promise<ArrayBuffer> {
    const key = await this.importPrivateKey(privateKey);
    const dataBuffer = Buffer.from(data, 'utf-8');
    return crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      dataBuffer
    );
  }

  private async importPrivateKey(pem: string): Promise<CryptoKey> {
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = pem
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');
    const binaryDer = Buffer.from(pemContents, 'base64');

    return crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign']
    );
  }

}

export const simplifiedCrypto = SimplifiedCrypto.getInstance(); 