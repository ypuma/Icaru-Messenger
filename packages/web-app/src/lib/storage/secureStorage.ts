import { FallbackStorage } from './fallbackStorage';

export interface StoredAccount {
  handle: string;
  identityKeyPair: {
    pubKey: string;
    privKey: string;
  };
  preKeyBundle: any;
  recoveryPhrase: string;
  createdAt: Date;
}

export interface SecureStorageOptions {
  password: string;
  dbName?: string;
  version?: number;
}

/**
 * Secure Storage using IndexedDB with encryption
 * All sensitive data is encrypted before storage
 */
export class SecureStorage {
  private db: IDBDatabase | null = null;
  private encryptionKey: Uint8Array | null = null;
  private salt: Uint8Array;

  constructor(private options: SecureStorageOptions) {
    // Generate or retrieve salt for key derivation
    this.salt = this.getSalt();
  }

  /**
   * Initialize the secure storage
   */
  async initialize(): Promise<void> {
    try {
      // Derive encryption key from password using PBKDF2
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(this.options.password);
      
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
          salt: this.salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        256 // 32 bytes
      );
      
      this.encryptionKey = new Uint8Array(derivedKey);
      
      // Open IndexedDB
      this.db = await this.openDatabase();
      
      console.log('Secure storage initialized successfully');
    } catch (error) {
      console.error('Failed to initialize secure storage:', error);
      throw new Error('Secure storage initialization failed');
    }
  }

  /**
   * Store account data securely
   */
  async storeAccount(account: StoredAccount): Promise<void> {
    if (!this.db || !this.encryptionKey) {
      throw new Error('Secure storage not initialized');
    }

    try {
      // Encrypt the account data BEFORE creating the transaction
      const accountData = JSON.stringify(account);
      const encryptedData = await this.encryptData(accountData);
      
      // Now create the transaction and perform the database operation
      const transaction = this.db.transaction(['accounts'], 'readwrite');
      const store = transaction.objectStore('accounts');
      
      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          handle: account.handle,
          data: encryptedData,
          timestamp: Date.now()
        });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        
        // Handle transaction errors as well
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });
      
      console.log('Account stored successfully');
    } catch (error) {
      console.error('Failed to store account:', error);
      throw new Error('Failed to store account data');
    }
  }

  /**
   * Retrieve account data
   */
  async getAccount(handle: string): Promise<StoredAccount | null> {
    if (!this.db || !this.encryptionKey) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const transaction = this.db.transaction(['accounts'], 'readonly');
      const store = transaction.objectStore('accounts');
      
      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get(handle);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        
        // Handle transaction errors
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });
      
      if (!result) {
        return null;
      }
      
      // Decrypt the account data AFTER the transaction is complete
      const decryptedData = await this.decryptData(result.data);
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error('Failed to retrieve account:', error);
      throw new Error('Failed to retrieve account data');
    }
  }

  /**
   * Delete account data
   */
  async deleteAccount(handle: string): Promise<boolean> {
    if (!this.db) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const transaction = this.db.transaction(['accounts'], 'readwrite');
      const store = transaction.objectStore('accounts');
      
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(handle);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        
        // Handle transaction errors
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });
      
      console.log('Account deleted successfully');
      this.db.close();
      return true;
    } catch (_error) {
      console.error('Failed to delete account from IndexedDB');
      return false;
    }
  }

  /**
   * List all stored accounts
   */
  async listAccounts(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const transaction = this.db.transaction(['accounts'], 'readonly');
      const store = transaction.objectStore('accounts');
      
      const handles = await new Promise<string[]>((resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(request.error);
        
        // Handle transaction errors
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });
      
      return handles;
    } catch (error) {
      console.error('Failed to list accounts:', error);
      throw new Error('Failed to list accounts');
    }
  }

  /**
   * Check if an account exists
   */
  async hasAccount(handle: string): Promise<boolean> {
    try {
      const account = await this.getAccount(handle);
      return account !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    if (!this.db) {
      throw new Error('Secure storage not initialized');
    }

    try {
      const transaction = this.db.transaction(['accounts'], 'readwrite');
      const store = transaction.objectStore('accounts');
      
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        
        // Handle transaction errors
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });
      
      console.log('All data cleared from IndexedDB');
    } catch (error) {
      console.error('Failed to clear data from IndexedDB:', error);
      throw new Error('Failed to clear data');
    }
  }

  /**
   * Close the storage connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.encryptionKey = null;
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const dbName = this.options.dbName || 'SecMesStorage';
    const version = this.options.version || 1;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Create accounts object store
        if (!db.objectStoreNames.contains('accounts')) {
          const accountStore = db.createObjectStore('accounts', { keyPath: 'handle' });
          accountStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private getSalt(): Uint8Array {
    const saltKey = 'secmes_salt';
    let salt = localStorage.getItem(saltKey);
    
    if (!salt) {
      const newSalt = crypto.getRandomValues(new Uint8Array(32));
      salt = Array.from(newSalt).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(saltKey, salt);
      return newSalt;
    }
    
    // Convert hex string back to Uint8Array
    const bytes = salt.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || [];
    return new Uint8Array(bytes);
  }

  private async encryptData(data: string): Promise<{ ciphertext: string; iv: string }> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM
    
    // Import key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.encryptionKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    // Encrypt data
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      dataBytes
    );
    
    return {
      ciphertext: Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  }

  private async decryptData(encryptedData: { ciphertext: string; iv: string }): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    // Convert hex strings back to Uint8Array
    const ciphertext = new Uint8Array(
      encryptedData.ciphertext.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    const iv = new Uint8Array(
      encryptedData.iv.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    // Import key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.encryptionKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
}

// Storage manager singleton
class StorageManager {
  private storage: SecureStorage | FallbackStorage | null = null;
  private usingFallback: boolean = false;

  async initialize(password: string): Promise<void> {
    try {
      // Check if we're in a cross-origin iframe
      const isInIframe = window !== window.parent;
      const isCrossOrigin = (() => {
        try {
          return isInIframe && !window.parent.location.hostname;
        } catch (e) {
          return true;
        }
      })();

      // If we're in a cross-origin context, use fallback immediately
      if (isCrossOrigin) {
        console.warn('Cross-origin context detected, using fallback storage');
        this.storage = new FallbackStorage(password);
        await this.storage.initialize();
        this.usingFallback = true;
        console.log('✅ Using fallback localStorage storage');
        return;
      }

      // Try IndexedDB first
      this.storage = new SecureStorage({ password });
      await this.storage.initialize();
      this.usingFallback = false;
      console.log('✅ Using IndexedDB storage');
    } catch (indexedDBError) {
      console.warn('IndexedDB failed, trying fallback storage:', indexedDBError);
      
      try {
        // Fallback to localStorage
        this.storage = new FallbackStorage(password);
        await this.storage.initialize();
        this.usingFallback = true;
        console.log('✅ Using fallback localStorage storage');
      } catch (fallbackError) {
        console.error('Both storage methods failed:', fallbackError);
        throw new Error('All storage initialization methods failed');
      }
    }
  }

  getStorage(): SecureStorage | FallbackStorage {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  isUsingFallback(): boolean {
    return this.usingFallback;
  }

  close(): void {
    if (this.storage) {
      this.storage.close();
      this.storage = null;
    }
    this.usingFallback = false;
  }
}

export const storageManager = new StorageManager(); 