import { browserStorage } from '../storage/browserStorage';
import { sessionManager } from '../crypto/sessionManager';
import { messageStorage } from '../storage/messageStorage';

/**
 * Cache Manager - Handles comprehensive cache clearing operations
 * Used primarily for secure logout and emergency data wipe scenarios
 */
export class CacheManager {
  
  /**
   * Clear all browser cache on logout
   * This is a comprehensive clearing that removes all app data
   */
  static async clearAllCacheOnLogout(): Promise<void> {
    console.log('🧹 Starting comprehensive cache clearing on logout...');
    
    try {
      // 1. Clear session manager cache (in-memory sessions and localStorage sessions)
      sessionManager.clearAllSessions();
      console.log('Session manager cache cleared');
      
      // 2. Clear message storage (IndexedDB for messages)
      await messageStorage.clearAllData();
      console.log('Message storage cleared');
      
      // 3. Clear browser storage (IndexedDB + localStorage with prefix)
      await browserStorage.clear();
      console.log('Browser storage cleared');
      
      // 4. Clear sessionStorage completely
      sessionStorage.clear();
      console.log('Session storage cleared');
      
      // 5. Clear any remaining localStorage items that might not have the prefix
      this.clearAdditionalLocalStorageItems();
      console.log('Additional localStorage items cleared');
      
      // 6. Clear any service worker caches if present
      await this.clearServiceWorkerCaches();
      console.log('Service worker caches cleared');
      
      console.log('All cache clearing completed successfully');
      
    } catch (error) {
      console.error('Error during cache clearing:', error);
      // Continue with emergency wipe even if some clearing failed
      await this.emergencyWipe();
    }
  }
  
  /**
   * Emergency cache wipe - more aggressive clearing
   * Used when standard clearing fails or for security emergencies
   */
  static async emergencyWipe(): Promise<void> {
    console.log('Starting emergency cache wipe...');
    
    try {
      // Use the emergency wipe from browserStorage which deletes entire IndexedDB
      await browserStorage.emergencyWipe();
      console.log('Emergency storage wipe completed');
      
      // Clear all localStorage completely
      localStorage.clear();
      console.log('All localStorage cleared');
      
      // Clear all sessionStorage completely
      sessionStorage.clear();
      console.log('All sessionStorage cleared');
      
      // Clear session manager
      sessionManager.clearAllSessions();
      console.log('Session manager emergency cleared');
      
      // Try to clear service worker caches
      await this.clearServiceWorkerCaches();
      console.log('Service worker caches emergency cleared');
      
      console.log('Emergency wipe completed successfully');
      
    } catch (error) {
      console.error('Emergency wipe failed:', error);
      throw new Error('Emergency cache wipe failed');
    }
  }
  
  /**
   * Clear additional localStorage items that might not have the secmes_ prefix
   */
  private static clearAdditionalLocalStorageItems(): void {
    const keysToRemove: string[] = [];
    
    // Common keys that might be used by the app
    const commonAppKeys = [
      'current_user',
      'current_session', 
      'device_id',
      'offline_session',
      'user_handle',
      'public_key',
      'private_key',
      'sessions',
      'contacts',
      'messages',
      'crypto_keys'
    ];
    
    // Check for keys with common app prefixes or exact matches
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Remove items with secmes_ prefix (might have been missed)
        if (key.startsWith('secmes_') || 
            key.startsWith('SecMes') || 
            key.startsWith('secure_messenger') ||
            commonAppKeys.some(appKey => key.includes(appKey))) {
          keysToRemove.push(key);
        }
      }
    }
    
    // Remove the identified keys
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`Removed localStorage key: ${key}`);
      } catch (error) {
        console.warn(`Failed to remove localStorage key ${key}:`, error);
      }
    });
  }
  
  /**
   * Clear service worker caches if present
   */
  private static async clearServiceWorkerCaches(): Promise<void> {
    try {
      if ('serviceWorker' in navigator && 'caches' in window) {
        const cacheNames = await caches.keys();
        const deletePromises = cacheNames.map(cacheName => {
          console.log(`Deleting cache: ${cacheName}`);
          return caches.delete(cacheName);
        });
        await Promise.all(deletePromises);
        console.log('All service worker caches cleared');
      }
    } catch (error) {
      console.warn('Failed to clear service worker caches:', error);
      // Don't throw error as this is not critical
    }
  }
  
  /**
   * Partial cache clear - for less sensitive operations
   * Only clears user session data but keeps app configuration
   */
  static async clearUserSessionCache(): Promise<void> {
    console.log('🧹 Starting user session cache clearing...');
    
    try {
      // Clear session manager
      sessionManager.clearAllSessions();
      
      // Clear only user-specific localStorage items
      const userSessionKeys = [
        'secmes_current_user',
        'secmes_current_session',
        'secmes_sessions_v2',
        'secmes_device_id'
      ];
      
      userSessionKeys.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      console.log('User session cache cleared');
      
    } catch (error) {
      console.error('Failed to clear user session cache:', error);
      throw error;
    }
  }
  
  /**
   * Get cache status for debugging
   */
  static getCacheStatus(): {
    localStorage: number;
    sessionStorage: number;
    sessionManager: { sessionCount: number; pendingCount: number };
    indexedDBAvailable: boolean;
  } {
    return {
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      sessionManager: sessionManager.getCacheStats(),
      indexedDBAvailable: 'indexedDB' in window
    };
  }
}

// Export utility functions for convenience
export const clearAllCacheOnLogout = CacheManager.clearAllCacheOnLogout.bind(CacheManager);
export const emergencyWipe = CacheManager.emergencyWipe.bind(CacheManager);
export const clearUserSessionCache = CacheManager.clearUserSessionCache.bind(CacheManager);
export const getCacheStatus = CacheManager.getCacheStatus.bind(CacheManager); 