import { browserStorage } from '../storage/browserStorage';
import { SignalCrypto } from './signalCrypto';
import type { Session } from './signalCrypto';
import { keyRotationService } from './keyRotationService';
import type { RatchetState, SignalMessage } from '@secure-messenger/shared';

interface PFSSessionData {
  sessionKeys: any; // Legacy session keys
  ratchetState: RatchetState;
  initialized: boolean;
  lastActivity: Date;
}

interface PFSMessage extends SignalMessage {
  messageNumber: number;
  previousChainLength: number;
}

export class PFSIntegration {
  private static sessions: Map<string, PFSSessionData> = new Map();

  /**
   * Initialize PFS for a given contact address
   */
  static async initializePFS(address: string, session: Session): Promise<void> {
    try {
      console.log(`Initializing PFS for ${address}`);
      
      // Create ratchet state from session keys
      const ratchetState = await SignalCrypto.initializeRatchet(session);
      
      // Store ratchet state
      await browserStorage.storeRatchetState(address, ratchetState);
      
      // Cache session data
      this.sessions.set(address, {
        sessionKeys: null, // We don't store legacy keys in this case
        ratchetState,
        initialized: true,
        lastActivity: new Date()
      });
      
      // Start automatic key rotation
      keyRotationService.startRotation(address);
      
      console.log(`PFS initialized for ${address}`);
    } catch (error) {
      console.error(`Failed to initialize PFS for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Encrypt a message with PFS
   */
  static async encryptMessage(address: string, message: string): Promise<PFSMessage> {
    try {
      let sessionData = this.sessions.get(address);
      
      if (!sessionData) {
        // Try to load from storage
        const storedRatchetState = await browserStorage.getRatchetState(address);
        if (!storedRatchetState) {
          throw new Error(`No PFS session found for ${address}. Initialize PFS first.`);
        }
        
        sessionData = {
          sessionKeys: null, // We don't store legacy keys in this case
          ratchetState: storedRatchetState,
          initialized: true,
          lastActivity: new Date()
        };
        this.sessions.set(address, sessionData);
      }

      // Encrypt with PFS
      const result = await SignalCrypto.encryptWithPFS(message, sessionData.ratchetState);
      
      // Check for message-based rotation
      const rotatedState = await keyRotationService.checkMessageBasedRotation(
        address, 
        result.newRatchetState
      );
      
      // Update session data
      sessionData.ratchetState = rotatedState;
      sessionData.lastActivity = new Date();
      
      // Store updated ratchet state
      await browserStorage.storeRatchetState(address, rotatedState);
      
      // Convert to PFS message format
      const pfsMessage: PFSMessage = {
        type: 1, // Message type from SignalMessage
        body: JSON.stringify(result.cipherPacket),
        messageNumber: result.cipherPacket.messageNumber || 0,
        previousChainLength: result.cipherPacket.previousChainLength || 0
      };
      
      console.log(`Message encrypted with PFS for ${address}:`, {
        messageNumber: pfsMessage.messageNumber,
        chainLength: pfsMessage.previousChainLength
      });
      
      return pfsMessage;
    } catch (error) {
      console.error(`Failed to encrypt message for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Decrypt a message with PFS
   */
  static async decryptMessage(address: string, pfsMessage: PFSMessage): Promise<string> {
    try {
      let sessionData = this.sessions.get(address);
      
      if (!sessionData) {
        // Try to load from storage
        const storedRatchetState = await browserStorage.getRatchetState(address);
        if (!storedRatchetState) {
          throw new Error(`No PFS session found for ${address}`);
        }
        
        sessionData = {
          sessionKeys: null,
          ratchetState: storedRatchetState,
          initialized: true,
          lastActivity: new Date()
        };
        this.sessions.set(address, sessionData);
      }

      // Parse cipher packet from message body
      const cipherPacket = JSON.parse(pfsMessage.body as string);
      cipherPacket.messageNumber = pfsMessage.messageNumber;
      cipherPacket.previousChainLength = pfsMessage.previousChainLength;
      
      // Decrypt with PFS
      const result = await SignalCrypto.decryptWithPFS(cipherPacket, sessionData.ratchetState);
      
      // Update session data
      sessionData.ratchetState = result.newRatchetState;
      sessionData.lastActivity = new Date();
      
      // Store updated ratchet state
      await browserStorage.storeRatchetState(address, result.newRatchetState);
      
      console.log(`Message decrypted with PFS for ${address}:`, {
        messageNumber: pfsMessage.messageNumber,
        messageLength: result.message.length
      });
      
      return result.message;
    } catch (error) {
      console.error(`Failed to decrypt message for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Update the ratchet state in memory and storage.
   * Used after history decryption to sync the live state.
   */
  static async updateRatchetState(address: string, newRatchetState: RatchetState): Promise<void> {
    // Update in-memory cache
    let sessionData = this.sessions.get(address);
    if (sessionData) {
      sessionData.ratchetState = newRatchetState;
      sessionData.lastActivity = new Date();
    } else {
      // If not in memory, create a new entry
      sessionData = {
        sessionKeys: null,
        ratchetState: newRatchetState,
        initialized: true,
        lastActivity: new Date()
      };
      this.sessions.set(address, sessionData);
    }
    
    // Update persistent storage
    await browserStorage.storeRatchetState(address, newRatchetState);
    console.log(`Ratchet state updated for ${address} after history decryption.`);
  }

  /**
   * Check if PFS is initialized for an address
   */
  static async isPFSInitialized(address: string): Promise<boolean> {
    const sessionData = this.sessions.get(address);
    if (sessionData?.initialized) {
      return true;
    }
    
    // Check storage
    const storedRatchetState = await browserStorage.getRatchetState(address);
    return storedRatchetState !== null;
  }

  /**
   * Get PFS status for an address
   */
  static async getPFSStatus(address: string): Promise<{
    initialized: boolean;
    messagesSent?: number;
    messagesReceived?: number;
    lastActivity?: Date;
    rotationStatus?: any;
  }> {
    const sessionData = this.sessions.get(address);
    const rotationStatus = keyRotationService.getRotationStatus(address);
    
    if (!sessionData) {
      const storedRatchetState = await browserStorage.getRatchetState(address);
      if (storedRatchetState) {
        return {
          initialized: true,
          messagesSent: storedRatchetState.sendMessageNumber,
          messagesReceived: storedRatchetState.receiveMessageNumber,
          rotationStatus
        };
      }
      return { initialized: false };
    }
    
    return {
      initialized: sessionData.initialized,
      messagesSent: sessionData.ratchetState.sendMessageNumber,
      messagesReceived: sessionData.ratchetState.receiveMessageNumber,
      lastActivity: sessionData.lastActivity,
      rotationStatus
    };
  }

  /**
   * Emergency key rotation for an address
   */
  static async emergencyRotation(address: string): Promise<void> {
    console.log(`Initiating emergency key rotation for ${address}`);
    
    const sessionData = this.sessions.get(address);
    if (sessionData) {
      // Rotate keys immediately
      const rotatedState = await SignalCrypto.rotateKeys(sessionData.ratchetState);
      sessionData.ratchetState = rotatedState;
      await browserStorage.storeRatchetState(address, rotatedState);
    }
    
    // Trigger service-level emergency rotation
    await keyRotationService.emergencyRotation(address);
    
          console.log(`Emergency key rotation completed for ${address}`);
  }

  /**
   * Clean up PFS session (remove from memory, keep storage)
   */
  static cleanupSession(address: string): void {
    const sessionData = this.sessions.get(address);
    if (sessionData) {
      // Zero out sensitive data
      SignalCrypto.zeroizeMemory(sessionData.ratchetState);
      this.sessions.delete(address);
      
      // Stop rotation timer
      keyRotationService.stopRotation(address);
      
      console.log(`🧹 Cleaned up PFS session for ${address}`);
    }
  }

  /**
   * Remove all PFS data for an address (including storage)
   */
  static async removePFSData(address: string): Promise<void> {
    // Clean up memory
    this.cleanupSession(address);
    
    // Remove from storage
    await browserStorage.removeRatchetState(address);
    
    console.log(`Removed all PFS data for ${address}`);
  }

  /**
   * Migrate legacy session to PFS
   */
  static async migrateLegacySession(address: string, sessionKeys: any): Promise<void> {
    console.log(`Migrating legacy session to PFS for ${address}`);
    
    // Check if already migrated
    const existing = await browserStorage.getRatchetState(address);
    if (existing) {
      console.log(`PFS already initialized for ${address}, skipping migration`);
      return;
    }
    
    // Initialize PFS with existing session keys
    await this.initializePFS(address, sessionKeys);
    
          console.log(`Legacy session migrated to PFS for ${address}`);
  }

  /**
   * Get memory usage statistics
   */
  static getMemoryStats(): {
    activeSessions: number;
    totalSkippedKeys: number;
    memoryUsageEstimate: number;
  } {
    let totalSkippedKeys = 0;
    let memoryUsageEstimate = 0;
    
    for (const [, sessionData] of this.sessions) {
      totalSkippedKeys += sessionData.ratchetState.skippedKeys.size;
      // Rough estimate: 32 bytes per key + 64 bytes per chain key + overhead
      memoryUsageEstimate += (sessionData.ratchetState.skippedKeys.size * 32) + 128;
    }
    
    return {
      activeSessions: this.sessions.size,
      totalSkippedKeys,
      memoryUsageEstimate
    };
  }

  /**
   * Shutdown PFS integration
   */
  static shutdown(): void {
    // Clean up all sessions
    for (const [address] of this.sessions) {
      this.cleanupSession(address);
    }
    
    // Shutdown rotation service
    keyRotationService.stopAllRotations();
    
    console.log('PFS integration shutdown complete');
  }
}

// Export for convenience
export { keyRotationService };