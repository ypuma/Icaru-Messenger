import { 
  StorageError
} from '@secure-messenger/shared';
import type {
  IStorageProvider, 
  UserAccount, 
  Contact, 
  Message, 
  IdentityKeyPair, 
  RecoveryData,
  RatchetState
} from '@secure-messenger/shared';

export class BrowserStorageProvider implements IStorageProvider {
  private prefix = 'secmes_';
  private dbName = 'SecureMessengerDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  constructor() {
    // Initialize DB only if we're in a browser environment with IndexedDB support
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.initDB().catch(console.error);
    }
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB');
        reject(new StorageError('Failed to initialize database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains('identity')) {
          db.createObjectStore('identity', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'address' });
        }

        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'handle' });
        }

        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('senderId', 'senderId', { unique: false });
          messageStore.createIndex('recipientId', 'recipientId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('userAccount')) {
          db.createObjectStore('userAccount', { keyPath: 'handle' });
        }

        if (!db.objectStoreNames.contains('recovery')) {
          db.createObjectStore('recovery', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('general')) {
          db.createObjectStore('general', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('ratchetStates')) {
          db.createObjectStore('ratchetStates', { keyPath: 'address' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      if (typeof window === 'undefined' || !('indexedDB' in window)) {
        throw new StorageError('IndexedDB not available in this environment');
      }
      await this.initDB();
    }
    if (!this.db) {
      throw new StorageError('Database not available');
    }
    return this.db;
  }

  private async performTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.ensureDB();
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new StorageError(`Transaction failed: ${request.error?.message}`));
    });
  }

  // Identity Storage
  async storeIdentityKeyPair(keyPair: IdentityKeyPair): Promise<void> {
    try {
      await this.performTransaction('identity', 'readwrite', (store) =>
        store.put({ id: 'main', ...keyPair })
      );
    } catch (error) {
      throw new StorageError('Failed to store identity key pair', error);
    }
  }

  async getIdentityKeyPair(): Promise<IdentityKeyPair | null> {
    try {
      const result = await this.performTransaction('identity', 'readonly', (store) =>
        store.get('main')
      );
      return result ? { publicKey: result.publicKey, privateKey: result.privateKey } : null;
    } catch (error) {
      console.error('Failed to get identity key pair:', error);
      return null;
    }
  }

  // Session Storage
  async storeSession(address: string, sessionData: any): Promise<void> {
    try {
      await this.performTransaction('sessions', 'readwrite', (store) =>
        store.put({ address, data: sessionData, updatedAt: new Date() })
      );
    } catch (error) {
      throw new StorageError(`Failed to store session for ${address}`, error);
    }
  }

  async getSession(address: string): Promise<any | null> {
    try {
      const result = await this.performTransaction('sessions', 'readonly', (store) =>
        store.get(address)
      );
      return result?.data || null;
    } catch (error) {
      console.error(`Failed to get session for ${address}:`, error);
      return null;
    }
  }

  async removeSession(address: string): Promise<void> {
    try {
      await this.performTransaction('sessions', 'readwrite', (store) =>
        store.delete(address)
      );
    } catch (error) {
      throw new StorageError(`Failed to remove session for ${address}`, error);
    }
  }

  // Perfect Forward Secrecy Storage
  async storeRatchetState(address: string, ratchetState: RatchetState): Promise<void> {
    try {
      const serializedState = {
        address,
        rootKey: Array.from(ratchetState.rootKey),
        sendingChainKey: Array.from(ratchetState.sendingChainKey),
        receivingChainKey: Array.from(ratchetState.receivingChainKey),
        sendMessageNumber: ratchetState.sendMessageNumber,
        receiveMessageNumber: ratchetState.receiveMessageNumber,
        previousSendingChainLength: ratchetState.previousSendingChainLength,
        skippedKeys: Array.from(ratchetState.skippedKeys.entries()).map(([key, value]) => [key, Array.from(value)]),
        updatedAt: new Date()
      };

      await this.performTransaction('ratchetStates', 'readwrite', (store) =>
        store.put(serializedState)
      );
    } catch (error) {
      throw new StorageError(`Failed to store ratchet state for ${address}`, error);
    }
  }

  async getRatchetState(address: string): Promise<RatchetState | null> {
    try {
      const result = await this.performTransaction('ratchetStates', 'readonly', (store) =>
        store.get(address)
      );

      if (!result) return null;

      return {
        rootKey: new Uint8Array(result.rootKey),
        sendingChainKey: new Uint8Array(result.sendingChainKey),
        receivingChainKey: new Uint8Array(result.receivingChainKey),
        sendMessageNumber: result.sendMessageNumber,
        receiveMessageNumber: result.receiveMessageNumber,
        previousSendingChainLength: result.previousSendingChainLength,
        skippedKeys: new Map(result.skippedKeys.map(([key, value]: [number, number[]]) => [key, new Uint8Array(value)]))
      };
    } catch (error) {
      console.error(`Failed to get ratchet state for ${address}:`, error);
      return null;
    }
  }

  async removeRatchetState(address: string): Promise<void> {
    try {
      await this.performTransaction('ratchetStates', 'readwrite', (store) =>
        store.delete(address)
      );
    } catch (error) {
      throw new StorageError(`Failed to remove ratchet state for ${address}`, error);
    }
  }

  // Contact Storage
  async storeContact(contact: Contact): Promise<void> {
    try {
      await this.performTransaction('contacts', 'readwrite', (store) =>
        store.put({ ...contact, updatedAt: new Date() })
      );
    } catch (error) {
      throw new StorageError(`Failed to store contact ${contact.handle}`, error);
    }
  }

  async getContact(handle: string): Promise<Contact | null> {
    try {
      const result = await this.performTransaction('contacts', 'readonly', (store) =>
        store.get(handle)
      );
      return result ? {
        handle: result.handle,
        publicKey: result.publicKey,
        displayName: result.displayName,
        verified: result.verified,
        verificationDate: result.verificationDate
      } : null;
    } catch (error) {
      console.error(`Failed to get contact ${handle}:`, error);
      return null;
    }
  }

  async getAllContacts(): Promise<Contact[]> {
    try {
      const result = await this.performTransaction('contacts', 'readonly', (store) =>
        store.getAll()
      );
      return result.map(item => ({
        handle: item.handle,
        publicKey: item.publicKey,
        displayName: item.displayName,
        verified: item.verified,
        verificationDate: item.verificationDate
      }));
    } catch (error) {
      console.error('Failed to get all contacts:', error);
      return [];
    }
  }

  async removeContact(handle: string): Promise<void> {
    try {
      await this.performTransaction('contacts', 'readwrite', (store) =>
        store.delete(handle)
      );
    } catch (error) {
      throw new StorageError(`Failed to remove contact ${handle}`, error);
    }
  }

  // Message Storage
  async storeMessage(message: Message): Promise<void> {
    try {
      await this.performTransaction('messages', 'readwrite', (store) =>
        store.put(message)
      );
    } catch (error) {
      throw new StorageError(`Failed to store message ${message.id}`, error);
    }
  }

  async getMessages(contactHandle: string, limit: number = 50, offset: number = 0): Promise<Message[]> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      
      return new Promise((resolve, reject) => {
        const messages: Message[] = [];
        let count = 0;
        let skipped = 0;

        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor && count < limit) {
            const message = cursor.value;
            
            // Filter messages for the specific contact
            if (message.senderId === contactHandle || message.recipientId === contactHandle) {
              if (skipped >= offset) {
                messages.push(message);
                count++;
              } else {
                skipped++;
              }
            }
            cursor.continue();
          } else {
            // Sort by timestamp (newest first)
            messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            resolve(messages);
          }
        };
        request.onerror = () => reject(new StorageError('Failed to get messages'));
      });
    } catch (error) {
      console.error(`Failed to get messages for ${contactHandle}:`, error);
      return [];
    }
  }

  async removeMessage(messageId: string): Promise<void> {
    try {
      await this.performTransaction('messages', 'readwrite', (store) =>
        store.delete(messageId)
      );
    } catch (error) {
      throw new StorageError(`Failed to remove message ${messageId}`, error);
    }
  }

  // User Account Storage
  async storeUserAccount(account: UserAccount): Promise<void> {
    try {
      await this.performTransaction('userAccount', 'readwrite', (store) =>
        store.put({ ...account, updatedAt: new Date() })
      );
      
      // Also store in localStorage for quick access
      localStorage.setItem(this.prefix + 'current_handle', account.handle);
      localStorage.setItem(this.prefix + 'public_key', account.publicKey);
      if (account.privateKey) {
        localStorage.setItem(this.prefix + 'private_key', account.privateKey);
      }
    } catch (error) {
      throw new StorageError('Failed to store user account', error);
    }
  }

  async getUserAccount(): Promise<UserAccount | null> {
    try {
      // Try localStorage first for quick access
      const handle = localStorage.getItem(this.prefix + 'current_handle');
      if (handle) {
        const result = await this.performTransaction('userAccount', 'readonly', (store) =>
          store.get(handle)
        );
        return result || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to get user account:', error);
      return null;
    }
  }

  // Recovery Storage
  async storeRecoveryData(data: RecoveryData): Promise<void> {
    try {
      await this.performTransaction('recovery', 'readwrite', (store) =>
        store.put({ id: 'main', ...data })
      );
    } catch (error) {
      throw new StorageError('Failed to store recovery data', error);
    }
  }

  async getRecoveryData(): Promise<RecoveryData | null> {
    try {
      const result = await this.performTransaction('recovery', 'readonly', (store) =>
        store.get('main')
      );
      return result ? {
        seed: result.seed,
        encryptedBackup: result.encryptedBackup,
        version: result.version,
        timestamp: result.timestamp
      } : null;
    } catch (error) {
      console.error('Failed to get recovery data:', error);
      return null;
    }
  }

  // General Storage
  async setItem(key: string, value: any): Promise<void> {
    try {
      await this.performTransaction('general', 'readwrite', (store) =>
        store.put({ key, value, updatedAt: new Date() })
      );
    } catch (error) {
      throw new StorageError(`Failed to set item ${key}`, error);
    }
  }

  async getItem(key: string): Promise<any | null> {
    try {
      const result = await this.performTransaction('general', 'readonly', (store) =>
        store.get(key)
      );
      return result?.value || null;
    } catch (error) {
      console.error(`Failed to get item ${key}:`, error);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await this.performTransaction('general', 'readwrite', (store) =>
        store.delete(key)
      );
    } catch (error) {
      throw new StorageError(`Failed to remove item ${key}`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.ensureDB();
      const storeNames = ['identity', 'sessions', 'contacts', 'messages', 'userAccount', 'recovery', 'general', 'ratchetStates'];
      
      const transaction = db.transaction(storeNames, 'readwrite');
      
      const promises = storeNames.map(storeName => {
        return new Promise<void>((resolve, reject) => {
          const store = transaction.objectStore(storeName);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(new StorageError(`Failed to clear ${storeName}`));
        });
      });

      await Promise.all(promises);
      
      // Also clear localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      throw new StorageError('Failed to clear all storage', error);
    }
  }

  // Security Operations
  async emergencyWipe(): Promise<void> {
    try {
      // Clear all data
      await this.clear();
      
      // Clear session storage
      sessionStorage.clear();
      
      // Try to close and delete the database
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      
      // Delete the IndexedDB database
      return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(this.dbName);
        deleteRequest.onsuccess = () => {
          console.log('Emergency wipe completed successfully');
          resolve();
        };
        deleteRequest.onerror = () => {
          console.error('Failed to delete database during emergency wipe');
          reject(new StorageError('Failed to complete emergency wipe'));
        };
      });
    } catch (error) {
      throw new StorageError('Emergency wipe failed', error);
    }
  }
}

// Create singleton instance
// Create a singleton instance that handles initialization gracefully
let browserStorageInstance: BrowserStorageProvider | null = null;

export const browserStorage = (() => {
  if (!browserStorageInstance) {
    try {
      browserStorageInstance = new BrowserStorageProvider();
    } catch (error) {
      console.warn('Failed to initialize browser storage:', error);
      // Create a minimal instance that will try to initialize on first use
      browserStorageInstance = new BrowserStorageProvider();
    }
  }
  return browserStorageInstance;
})(); 