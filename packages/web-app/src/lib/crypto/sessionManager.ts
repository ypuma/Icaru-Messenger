import { SignalCrypto } from './signalCrypto';
import type { Session } from './signalCrypto';

interface SessionKeys {
  tx: Uint8Array; // Transmit key (for encrypting our messages)
  rx: Uint8Array; // Receive key (for decrypting their messages)
}

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

// Helper function to convert SessionKeys to/from JSON for storage
interface SerializableSessionKeys {
  tx: number[]; // Array of numbers for JSON serialization
  rx: number[]; // Array of numbers for JSON serialization
}

interface SerializableSession {
  keys: SerializableSessionKeys;
  role: 'CLIENT' | 'SERVER';
}

/**
 * Global session manager to persist encryption sessions across chat tabs
 */
class SessionManager {
  private sessionCache = new Map<string, Session>();
  private pendingSessionPromises = new Map<string, Promise<Session>>();
  private initialized = false;
  private readonly STORAGE_KEY = 'secmes_sessions_v2'; // v2 to avoid conflicts with old format

  async initialize() {
    if (!this.initialized) {
      await SignalCrypto.initialize();
      this.loadPersistedSessions();
      this.initialized = true;
    }
  }

  /**
   * Load persisted sessions from localStorage
   */
  private loadPersistedSessions(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, SerializableSession>;
        for (const [userHandle, serializedSession] of Object.entries(parsed)) {
          const session: Session = {
            keys: {
              tx: new Uint8Array(serializedSession.keys.tx),
              rx: new Uint8Array(serializedSession.keys.rx)
            },
            role: serializedSession.role
          };
          this.sessionCache.set(userHandle, session);
        }
        console.log('Restored', this.sessionCache.size, 'persisted sessions from storage');
      }
    } catch (error) {
              console.error('Failed to load persisted sessions:', error);
      // Clear corrupted data
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Persist sessions to localStorage
   */
  private persistSessions(): void {
    try {
      const serializable: Record<string, SerializableSession> = {};
      for (const [userHandle, session] of this.sessionCache.entries()) {
        serializable[userHandle] = {
          keys: {
            tx: Array.from(session.keys.tx),
            rx: Array.from(session.keys.rx)
          },
          role: session.role
        };
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serializable));
              console.log('Persisted', this.sessionCache.size, 'sessions to storage');
    } catch (error) {
      console.error('Failed to persist sessions:', error);
    }
  }

  /**
   * Get or create a session with a user, caching the result globally
   */
  async getOrCreateSession(
    userHandle: string,
    currentUser: {
      handle: string;
      publicKey: string;
      privateKey: string;
      sessionToken: string;
    }
  ): Promise<Session> {
    // Ensure initialized
    await this.initialize();

    // 1) Return cached session immediately if present
    const cached = this.sessionCache.get(userHandle);
    if (cached) {
      console.log('📋 Using cached session for:', userHandle);
      return cached;
    }

    // 2) If another caller is already deriving a session for this peer,
    //    wait for it to finish instead of starting a second attempt.
    const pending = this.pendingSessionPromises.get(userHandle);
    if (pending) {
      console.log('⏳ Awaiting in-flight session derivation for:', userHandle);
      return pending;
    }

          console.log('Creating new session with:', userHandle);

    const ourIdentityKey: KeyPair = {
      publicKey: currentUser.publicKey,
      privateKey: currentUser.privateKey,
    };

    // Kick off the async derivation and store the promise *before* awaiting
    const derivationPromise = SignalCrypto
      .establishSessionWithUser(
        ourIdentityKey,
        userHandle,
        currentUser.sessionToken
      )
      .then((newSession) => {
        // Cache the session once resolved
        this.sessionCache.set(userHandle, newSession);
        
        // Persist to localStorage for tab switching
        this.persistSessions();

        // Clean up the pending map
        this.pendingSessionPromises.delete(userHandle);

        console.log('Session cached for:', userHandle, 'cache size:', this.sessionCache.size);
        return newSession;
      })
      .catch((err) => {
        this.pendingSessionPromises.delete(userHandle);
        throw err;
      });

    this.pendingSessionPromises.set(userHandle, derivationPromise);
    return derivationPromise;
  }

  /**
   * Get a cached session if it exists
   */
  getCachedSession(userHandle: string): Session | undefined {
    // Ensure we load from storage if not initialized
    if (!this.initialized) {
      this.loadPersistedSessions();
      this.initialized = true;
    }
    return this.sessionCache.get(userHandle);
  }

  /**
   * Clear all sessions (for logout/security)
   */
  clearAllSessions(): void {
    this.sessionCache.clear();
    this.pendingSessionPromises.clear();
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🧹 All sessions cleared');
  }

  /**
   * Remove a specific session
   */
  removeSession(userHandle: string): void {
    this.sessionCache.delete(userHandle);
    this.persistSessions();
    console.log('Session removed for:', userHandle);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { sessionCount: number; pendingCount: number } {
    return {
      sessionCount: this.sessionCache.size,
      pendingCount: this.pendingSessionPromises.size
    };
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
export type { SessionKeys };