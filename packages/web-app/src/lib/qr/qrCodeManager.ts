import QRCode from 'qrcode';
import sodium from 'libsodium-wrappers';
import { formatHandle } from '../utils/handle';

interface QRCodeData {
  handle: string;
  publicKey: string;
  nonce: string;
  timestamp: number;
  challenge?: string;
  version: string;
  type: 'identity' | 'verification';
}

interface VerificationChallenge {
  challenge: string;
  response: string;
  timestamp: number;
  expiresAt: number;
}

interface QRCodeResult {
  data: string;
  url: string;
  nonce: string;
  expiresAt: number;
}

class QRCodeManager {
  private readonly QR_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
  private readonly CHALLENGE_EXPIRY_TIME = 2 * 60 * 1000; // 2 minutes
  private usedNonces: Set<string> = new Set();
  private activeChallenges: Map<string, VerificationChallenge> = new Map();

  constructor() {
    this.initializeSodium();
    this.loadUsedNonces();
    this.setupCleanupInterval();
  }

  private async initializeSodium() {
    await sodium.ready;
  }

  /**
   * Generate identity QR code with replay protection
   */
  async generateIdentityQR(
    handle: string, 
    publicKey: string,
    options: {
      size?: number;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
      margin?: number;
    } = {}
  ): Promise<QRCodeResult> {
    await sodium.ready;

    try {
      const timestamp = Date.now();
      const nonce = this.generateSecureNonce();
      const expiresAt = timestamp + this.QR_EXPIRY_TIME;

      const qrData: QRCodeData = {
        handle: formatHandle(handle),
        publicKey,
        nonce,
        timestamp,
        version: '1.0',
        type: 'identity'
      };

      const dataString = JSON.stringify(qrData);

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(dataString, {
        errorCorrectionLevel: options.errorCorrectionLevel || 'M',
        type: 'image/png',
        margin: options.margin || 1,
        width: options.size || 256,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Store nonce for replay protection
      this.storeNonce(nonce, expiresAt);

      return {
        data: dataString,
        url: qrCodeUrl,
        nonce,
        expiresAt
      };
    } catch (error) {
      console.error('Failed to generate identity QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate verification QR code with challenge-response
   */
  async generateVerificationQR(
    handle: string,
    publicKey: string,
    challenge: string,
    options: {
      size?: number;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
      margin?: number;
    } = {}
  ): Promise<QRCodeResult> {
    await sodium.ready;

    try {
      const timestamp = Date.now();
      const nonce = this.generateSecureNonce();
      const expiresAt = timestamp + this.QR_EXPIRY_TIME;

      const qrData: QRCodeData = {
        handle: formatHandle(handle),
        publicKey,
        nonce,
        timestamp,
        challenge,
        version: '1.0',
        type: 'verification'
      };

      const dataString = JSON.stringify(qrData);

      // Generate QR code with higher error correction for verification
      const qrCodeUrl = await QRCode.toDataURL(dataString, {
        errorCorrectionLevel: options.errorCorrectionLevel || 'H',
        type: 'image/png',
        margin: options.margin || 2,
        width: options.size || 256,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Store nonce and challenge
      this.storeNonce(nonce, expiresAt);
      this.storeChallenge(challenge, expiresAt);

      return {
        data: dataString,
        url: qrCodeUrl,
        nonce,
        expiresAt
      };
    } catch (error) {
      console.error('Failed to generate verification QR code:', error);
      throw new Error('Failed to generate verification QR code');
    }
  }

  /**
   * Parse and validate QR code data
   */
  async parseQRCode(qrDataString: string): Promise<{
    valid: boolean;
    data?: QRCodeData;
    error?: string;
    securityWarning?: string;
  }> {
    try {
      const qrData: QRCodeData = JSON.parse(qrDataString);

      // Validate QR code structure
      const structureValidation = this.validateQRStructure(qrData);
      if (!structureValidation.valid) {
        return structureValidation;
      }

      // Check if QR code has expired
      const now = Date.now();
      const age = now - qrData.timestamp;
      
      if (age > this.QR_EXPIRY_TIME) {
        return {
          valid: false,
          error: 'QR code has expired. Please generate a new one.'
        };
      }

      // Check for replay attacks
      if (this.isNonceUsed(qrData.nonce)) {
        return {
          valid: false,
          error: 'This QR code has already been used.',
          securityWarning: 'Potential replay attack detected!'
        };
      }

      // Mark nonce as used
      this.markNonceAsUsed(qrData.nonce);

      // Additional security checks for verification QR codes
      if (qrData.type === 'verification' && qrData.challenge) {
        const challengeValid = this.validateChallenge(qrData.challenge);
        if (!challengeValid) {
          return {
            valid: false,
            error: 'Invalid or expired verification challenge.',
            securityWarning: 'Verification challenge failed'
          };
        }
      }

      // Security warning for old QR codes (but still within expiry)
      let securityWarning: string | undefined;
      if (age > this.QR_EXPIRY_TIME * 0.8) { // Warning when 80% of expiry time has passed
        securityWarning = 'This QR code is nearing expiration. Consider generating a new one for better security.';
      }

      return {
        valid: true,
        data: qrData,
        securityWarning
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid QR code format'
      };
    }
  }

  /**
   * Validate QR code structure
   */
  private validateQRStructure(qrData: any): {
    valid: boolean;
    error?: string;
  } {
    // Check required fields
    const requiredFields = ['handle', 'publicKey', 'nonce', 'timestamp', 'version', 'type'];
    for (const field of requiredFields) {
      if (!qrData[field]) {
        return {
          valid: false,
          error: `Missing required field: ${field}`
        };
      }
    }

    // Validate handle format
    if (typeof qrData.handle !== 'string' || !/^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(qrData.handle)) {
      return {
        valid: false,
        error: 'Invalid handle format'
      };
    }

    // Validate timestamp
    if (typeof qrData.timestamp !== 'number' || qrData.timestamp <= 0) {
      return {
        valid: false,
        error: 'Invalid timestamp'
      };
    }

    // Validate nonce format
    if (typeof qrData.nonce !== 'string' || qrData.nonce.length < 32) {
      return {
        valid: false,
        error: 'Invalid nonce format'
      };
    }

    // Validate version
    if (qrData.version !== '1.0') {
      return {
        valid: false,
        error: 'Unsupported QR code version'
      };
    }

    // Validate type
    if (!['identity', 'verification'].includes(qrData.type)) {
      return {
        valid: false,
        error: 'Invalid QR code type'
      };
    }

    return { valid: true };
  }

  /**
   * Generate verification challenge
   */
  generateVerificationChallenge(): string {
    const challenge = sodium.to_hex(sodium.randombytes_buf(16));
    return challenge;
  }

  /**
   * Create challenge response
   */
  async createChallengeResponse(
    challenge: string,
    privateKey: string
  ): Promise<string> {
    await sodium.ready;

    try {
      const keyData = JSON.parse(privateKey);
      const signKey = sodium.from_hex(keyData.sign);
      
      // Sign the challenge with the private key
      const signature = sodium.crypto_sign_detached(challenge, signKey);
      return sodium.to_hex(signature);
    } catch (error) {
      throw new Error('Failed to create challenge response');
    }
  }

  /**
   * Verify challenge response
   */
  async verifyChallengeResponse(
    challenge: string,
    response: string,
    publicKey: string
  ): Promise<boolean> {
    await sodium.ready;

    try {
      const keyData = JSON.parse(publicKey);
      const pubKey = sodium.from_hex(keyData.sign);
      const signature = sodium.from_hex(response);
      
      return sodium.crypto_sign_verify_detached(signature, challenge, pubKey);
    } catch (error) {
      console.error('Challenge response verification failed:', error);
      return false;
    }
  }

  /**
   * Generate secure nonce
   */
  private generateSecureNonce(): string {
    return sodium.to_hex(sodium.randombytes_buf(16));
  }

  /**
   * Store nonce for replay protection
   */
  private storeNonce(nonce: string, expiresAt: number): void {
    this.usedNonces.add(nonce);
    
    // Store in localStorage for persistence across sessions
    const storedNonces = this.getStoredNonces();
    storedNonces[nonce] = expiresAt;
    localStorage.setItem('secmes_qr_nonces', JSON.stringify(storedNonces));
  }

  /**
   * Check if nonce has been used
   */
  private isNonceUsed(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  /**
   * Mark nonce as used
   */
  private markNonceAsUsed(nonce: string): void {
    this.usedNonces.add(nonce);
  }

  /**
   * Store verification challenge
   */
  private storeChallenge(challenge: string, expiresAt: number): void {
    const verificationChallenge: VerificationChallenge = {
      challenge,
      response: '',
      timestamp: Date.now(),
      expiresAt
    };
    
    this.activeChallenges.set(challenge, verificationChallenge);
  }

  /**
   * Validate challenge
   */
  private validateChallenge(challenge: string): boolean {
    const challengeData = this.activeChallenges.get(challenge);
    if (!challengeData) {
      return false;
    }

    const now = Date.now();
    return now < challengeData.expiresAt;
  }

  /**
   * Load used nonces from storage
   */
  private loadUsedNonces(): void {
    const stored = this.getStoredNonces();
    const now = Date.now();

    // Only load non-expired nonces
    for (const [nonce, expiresAt] of Object.entries(stored)) {
      if (expiresAt > now) {
        this.usedNonces.add(nonce);
      }
    }
  }

  /**
   * Get stored nonces from localStorage
   */
  private getStoredNonces(): Record<string, number> {
    try {
      const stored = localStorage.getItem('secmes_qr_nonces');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Setup cleanup interval for expired nonces and challenges
   */
  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredData();
    }, 60000); // Cleanup every minute
  }

  /**
   * Clean up expired nonces and challenges
   */
  private cleanupExpiredData(): void {
    const now = Date.now();

    // Cleanup expired nonces
    const storedNonces = this.getStoredNonces();
    const validNonces: Record<string, number> = {};
    
    for (const [nonce, expiresAt] of Object.entries(storedNonces)) {
      if (expiresAt > now) {
        validNonces[nonce] = expiresAt;
      } else {
        this.usedNonces.delete(nonce);
      }
    }
    
    localStorage.setItem('secmes_qr_nonces', JSON.stringify(validNonces));

    // Cleanup expired challenges
    for (const [challenge, data] of this.activeChallenges.entries()) {
      if (data.expiresAt <= now) {
        this.activeChallenges.delete(challenge);
      }
    }
  }

  /**
   * Clear all nonces and challenges (for emergency killswitch)
   */
  clearAllData(): void {
    this.usedNonces.clear();
    this.activeChallenges.clear();
    localStorage.removeItem('secmes_qr_nonces');
    console.log('QR code manager data cleared');
  }

  /**
   * Get QR code capabilities
   */
  getCapabilities(): {
    expiryTime: number;
    challengeExpiryTime: number;
    supportedVersions: string[];
    supportedTypes: string[];
    replayProtection: boolean;
    challengeResponse: boolean;
  } {
    return {
      expiryTime: this.QR_EXPIRY_TIME,
      challengeExpiryTime: this.CHALLENGE_EXPIRY_TIME,
      supportedVersions: ['1.0'],
      supportedTypes: ['identity', 'verification'],
      replayProtection: true,
      challengeResponse: true
    };
  }
}

// Singleton instance
export const qrCodeManager = new QRCodeManager();
export type { QRCodeData, QRCodeResult, VerificationChallenge }; 