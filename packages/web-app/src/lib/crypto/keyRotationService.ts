import type { RatchetState } from '@secure-messenger/shared';
import { SignalCrypto } from './signalCrypto';
import { PerfectForwardSecrecy } from './perfectForwardSecrecy';
import { browserStorage } from '../storage/browserStorage';

interface RotationConfig {
  messageInterval: number; // Rotate keys every N messages
  timeInterval: number; // Rotate keys every N milliseconds
  maxSkippedKeys: number; // Maximum number of skipped keys to store
  cleanupInterval: number; // Clean up old keys every N milliseconds
}

interface RotationTimer {
  address: string;
  timer: NodeJS.Timeout;
  lastRotation: Date;
}

export class KeyRotationService {
  private static instance: KeyRotationService | null = null;
  private rotationTimers: Map<string, RotationTimer> = new Map();
  private config: RotationConfig = {
    messageInterval: 100, // Rotate every 100 messages
    timeInterval: 24 * 60 * 60 * 1000, // Rotate every 24 hours
    maxSkippedKeys: 50, // Keep max 50 skipped keys
    cleanupInterval: 60 * 60 * 1000 // Clean up every hour
  };

  private constructor() {}

  static getInstance(): KeyRotationService {
    if (!KeyRotationService.instance) {
      KeyRotationService.instance = new KeyRotationService();
    }
    return KeyRotationService.instance;
  }

  /**
   * Configure rotation parameters
   */
  configure(config: Partial<RotationConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('Key rotation service configured:', this.config);
  }

  /**
   * Start automatic key rotation for a conversation
   */
  startRotation(address: string): void {
    this.stopRotation(address);

    const timer = setInterval(async () => {
      try {
        await this.performTimeBasedRotation(address);
      } catch (error) {
        console.error(`Time-based rotation failed for ${address}:`, error);
      }
    }, this.config.timeInterval);

    this.rotationTimers.set(address, {
      address,
      timer,
      lastRotation: new Date()
    });

          console.log(`Started time-based key rotation for ${address} (interval: ${this.config.timeInterval}ms)`);
  }

  /**
   * Stop automatic key rotation for a conversation
   */
  stopRotation(address: string): void {
    const existing = this.rotationTimers.get(address);
    if (existing) {
      clearInterval(existing.timer);
      this.rotationTimers.delete(address);
      console.log(`Stopped key rotation for ${address}`);
    }
  }

  /**
   * Stop all rotation timers
   */
  stopAllRotations(): void {
    for (const [address] of this.rotationTimers) {
      this.stopRotation(address);
    }
    console.log('Stopped all key rotations');
  }

  /**
   * Check if message-based rotation is needed and perform it
   */
  async checkMessageBasedRotation(address: string, ratchetState: RatchetState): Promise<RatchetState> {
    const shouldRotate = ratchetState.sendMessageNumber > 0 && 
                         ratchetState.sendMessageNumber % this.config.messageInterval === 0;

    if (shouldRotate) {
              console.log(`Performing message-based key rotation for ${address} at message ${ratchetState.sendMessageNumber}`);
      const rotatedState = await SignalCrypto.rotateKeys(ratchetState, this.config.messageInterval);
      await browserStorage.storeRatchetState(address, rotatedState);
      return rotatedState;
    }

    return ratchetState;
  }

  /**
   * Perform time-based key rotation
   */
  private async performTimeBasedRotation(address: string): Promise<void> {
    const ratchetState = await browserStorage.getRatchetState(address);
    if (!ratchetState) {
              console.log(`No ratchet state found for ${address}, skipping time-based rotation`);
      return;
    }

    const rotatedState = await SignalCrypto.rotateKeys(ratchetState);
    await browserStorage.storeRatchetState(address, rotatedState);

    const timerInfo = this.rotationTimers.get(address);
    if (timerInfo) {
      timerInfo.lastRotation = new Date();
    }

            console.log(`Performed time-based key rotation for ${address}`);
  }

  /**
   * Clean up old skipped keys for all conversations
   */
  async performGlobalCleanup(): Promise<void> {
    console.log('🧹 Starting global key cleanup...');
    
    try {
      // Get all stored ratchet states
      const allStates = await this.getAllRatchetStates();
      
      for (const [address, ratchetState] of allStates) {
        const cleanedState = SignalCrypto.cleanupOldKeys(ratchetState, this.config.maxSkippedKeys);
        await browserStorage.storeRatchetState(address, cleanedState);
      }
      
      console.log(`Global cleanup completed for ${allStates.size} conversations`);
    } catch (error) {
              console.error('Global cleanup failed:', error);
    }
  }

  /**
   * Get all stored ratchet states (helper method)
   */
  private async getAllRatchetStates(): Promise<Map<string, RatchetState>> {

    // For now, we'll return an empty map and improve this when we have better storage introspection
    const states = new Map<string, RatchetState>();
    

    // This could be done by maintaining an index or by scanning the storage
    
    return states;
  }

  /**
   * Start global cleanup timer
   */
  startGlobalCleanup(): void {
    setInterval(() => {
      this.performGlobalCleanup();
    }, this.config.cleanupInterval);
    
    console.log(`🧹 Started global cleanup timer (interval: ${this.config.cleanupInterval}ms)`);
  }

  /**
   * Get rotation status for a conversation
   */
  getRotationStatus(address: string): { active: boolean; lastRotation?: Date; nextRotation?: Date } {
    const timer = this.rotationTimers.get(address);
    
    if (!timer) {
      return { active: false };
    }

    const nextRotation = new Date(timer.lastRotation.getTime() + this.config.timeInterval);
    
    return {
      active: true,
      lastRotation: timer.lastRotation,
      nextRotation
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): RotationConfig {
    return { ...this.config };
  }

  /**
   * Emergency rotation - immediately rotate keys for a conversation
   */
  async emergencyRotation(address: string): Promise<void> {
            console.log(`Performing emergency key rotation for ${address}`);
    
    const ratchetState = await browserStorage.getRatchetState(address);
    if (!ratchetState) {
      throw new Error(`No ratchet state found for ${address}`);
    }

    const rotatedState = await SignalCrypto.rotateKeys(ratchetState);
    await browserStorage.storeRatchetState(address, rotatedState);

    // Update timer info if exists
    const timerInfo = this.rotationTimers.get(address);
    if (timerInfo) {
      timerInfo.lastRotation = new Date();
    }

            console.log(`Emergency key rotation completed for ${address}`);
  }

  /**
   * Cleanup and shutdown the service
   */
  shutdown(): void {
    this.stopAllRotations();
    console.log('Key rotation service shutdown complete');
  }
}

// Export singleton instance
export const keyRotationService = KeyRotationService.getInstance();