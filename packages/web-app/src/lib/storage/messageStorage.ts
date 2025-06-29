import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import sodium from 'libsodium-wrappers';

// Database configuration
const DB_NAME = 'secmes_messages';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_CONTACTS = 'contacts';
const STORE_METADATA = 'metadata';

interface EncryptedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  encryptedContent: string;
  plaintext?: string; // For our own outgoing messages
  messageType: 'text' | 'image' | 'file';
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  mediaUrl?: string;
  encryptedMediaKey?: string;
  createdAt: number;
  updatedAt: number;
}

interface Contact {
  id: string;
  handle: string;
  publicKey: string;
  nickname?: string;
  verified: boolean;
  lastSeen?: number;
  createdAt: number;
  updatedAt: number;
}

interface ConversationMetadata {
  conversationId: string;
  participantIds: string[];
  lastMessageId?: string;
  lastMessageTimestamp?: number;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
}

class MessageStorage {
  private db: IDBPDatabase | null = null;
  private encryptionKey: Uint8Array | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeSodium();
  }

  private async initializeSodium() {
    await sodium.ready;
  }

  /**
   * Initialize the database and encryption
   */
  async initialize(userPrivateKey: string): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize sodium
      await sodium.ready;

      // Derive encryption key from user's private key
      this.encryptionKey = await this.deriveEncryptionKey(userPrivateKey);

      // Open IndexedDB
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db: any) {
          // Messages store
          if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
            const messageStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
            messageStore.createIndex('conversationId', 'conversationId');
            messageStore.createIndex('timestamp', 'timestamp');
            messageStore.createIndex('status', 'status');
            messageStore.createIndex('senderId', 'senderId');
            messageStore.createIndex('recipientId', 'recipientId');
          }

          // Contacts store
          if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
            const contactStore = db.createObjectStore(STORE_CONTACTS, { keyPath: 'id' });
            contactStore.createIndex('handle', 'handle', { unique: true });
            contactStore.createIndex('verified', 'verified');
          }

          // Metadata store for conversations
          if (!db.objectStoreNames.contains(STORE_METADATA)) {
            const metadataStore = db.createObjectStore(STORE_METADATA, { keyPath: 'conversationId' });
            metadataStore.createIndex('lastMessageTimestamp', 'lastMessageTimestamp');
            metadataStore.createIndex('unreadCount', 'unreadCount');
          }
        },
      });

      this.isInitialized = true;
      console.log('Message storage initialized successfully');
    } catch (error) {
      console.error('Failed to initialize message storage:', error);
      throw new Error('Failed to initialize encrypted storage');
    }
  }

  /**
   * Derive encryption key from user's private key
   */
  private async deriveEncryptionKey(privateKey: string): Promise<Uint8Array> {
    try {
      let keyBytes: Uint8Array;

      // Case 1: privateKey is a JSON string with a `sign` property (older format)
      try {
        const keyData = JSON.parse(privateKey);
        if (keyData && typeof keyData.sign === 'string') {
          keyBytes = sodium.from_hex(keyData.sign);
        } else {
          throw new Error('Invalid keyData');
        }
      } catch (jsonErr) {
        // Case 2: privateKey is a raw hex string (current format)
        const isHex = /^[0-9a-fA-F]+$/.test(privateKey) && privateKey.length % 2 === 0;
        if (!isHex) {
          throw new Error('Private key format not recognized');
        }
        keyBytes = sodium.from_hex(privateKey);
      }

      // Use HKDF to derive storage encryption key (32-byte key, context string)
      return sodium.crypto_generichash(32, keyBytes, 'secmes_storage');
    } catch (error) {
      throw new Error('Failed to derive encryption key');
    }
  }

  /**
   * Encrypt data for storage
   */
  private encryptData(data: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');
    
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(data, nonce, this.encryptionKey);
    
    // Combine nonce and ciphertext
    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce);
    combined.set(ciphertext, nonce.length);
    
    return sodium.to_base64(combined);
  }

  /**
   * Decrypt data from storage
   */
  private decryptData(encryptedData: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');
    
    const combined = sodium.from_base64(encryptedData);
    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
    
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, this.encryptionKey);
    return sodium.to_string(plaintext);
  }

  /**
   * Store a message
   */
  async storeMessage(message: Omit<EncryptedMessage, 'createdAt' | 'updatedAt'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const messageId = message.id ?? sodium.to_hex(sodium.randombytes_buf(16));
    const now = Date.now();

    const encryptedMessage: EncryptedMessage = {
      ...message,
      id: messageId,
      createdAt: now,
      updatedAt: now,
      encryptedContent: this.encryptData(message.encryptedContent)
    };

    try {
      const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
      await tx.objectStore(STORE_MESSAGES).add(encryptedMessage);
      await tx.done;

      // Update conversation metadata
      await this.updateConversationMetadata(message.conversationId, messageId, now);

      return messageId;
    } catch (error) {
      console.error('Failed to store message:', error);
      throw new Error('Failed to store message');
    }
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    limit: number = 50,
    beforeTimestamp?: number
  ): Promise<EncryptedMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('conversationId');

      // Get messages for conversation
      let messages = await index.getAll(IDBKeyRange.only(conversationId));

      // Filter by timestamp if provided
      if (beforeTimestamp) {
        messages = messages.filter((msg: any) => msg.timestamp < beforeTimestamp);
      }

      // Sort by timestamp (newest first) and limit
      messages.sort((a: any, b: any) => b.timestamp - a.timestamp);
      messages = messages.slice(0, limit);

      // Decrypt message content
      return messages.map((msg: any) => ({
        ...msg,
        encryptedContent: this.decryptData(msg.encryptedContent)
      }));
    } catch (error) {
      console.error('Failed to get messages:', error);
      throw new Error('Failed to retrieve messages');
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read' | 'failed'): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }

    try {
      const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      
      const message = await store.get(messageId);
      if (message) {
        message.status = status;
        message.updatedAt = Date.now();
        await store.put(message);
      }
      
      await tx.done;
    } catch (error) {
      console.error('Failed to update message status:', error);
      throw new Error('Failed to update message status');
    }
  }

  /**
   * Store contact information
   */
  async storeContact(contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const contactId = sodium.to_hex(sodium.randombytes_buf(16));
    const now = Date.now();

    const encryptedContact: Contact = {
      ...contact,
      id: contactId,
      createdAt: now,
      updatedAt: now
    };

    try {
      const tx = this.db.transaction(STORE_CONTACTS, 'readwrite');
      await tx.objectStore(STORE_CONTACTS).add(encryptedContact);
      await tx.done;

      return contactId;
    } catch (error) {
      console.error('Failed to store contact:', error);
      throw new Error('Failed to store contact');
    }
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<Contact[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction(STORE_CONTACTS, 'readonly');
      const contacts = await tx.objectStore(STORE_CONTACTS).getAll();
      return contacts.sort((a: any, b: any) => a.handle.localeCompare(b.handle));
    } catch (error) {
      console.error('Failed to get contacts:', error);
      throw new Error('Failed to retrieve contacts');
    }
  }

  /**
   * Get contact by handle
   */
  async getContactByHandle(handle: string): Promise<Contact | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction(STORE_CONTACTS, 'readonly');
      const index = tx.objectStore(STORE_CONTACTS).index('handle');
      return await index.get(handle);
    } catch (error) {
      console.error('Failed to get contact by handle:', error);
      return undefined;
    }
  }

  /**
   * Update conversation metadata
   */
  private async updateConversationMetadata(
    conversationId: string,
    lastMessageId: string,
    timestamp: number
  ): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction(STORE_METADATA, 'readwrite');
      const store = tx.objectStore(STORE_METADATA);
      
      let metadata = await store.get(conversationId);
      
      if (metadata) {
        metadata.lastMessageId = lastMessageId;
        metadata.lastMessageTimestamp = timestamp;
        metadata.updatedAt = Date.now();
        await store.put(metadata);
      } else {
        // Create new metadata
        const newMetadata: ConversationMetadata = {
          conversationId,
          participantIds: [], // Will be populated separately
          lastMessageId,
          lastMessageTimestamp: timestamp,
          unreadCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await store.add(newMetadata);
      }
      
      await tx.done;
    } catch (error) {
      console.error('Failed to update conversation metadata:', error);
    }
  }

  /**
   * Get conversation list with metadata
   */
  async getConversations(): Promise<ConversationMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction(STORE_METADATA, 'readonly');
      const conversations = await tx.objectStore(STORE_METADATA).getAll();
      return conversations.sort((a: any, b: any) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
    } catch (error) {
      console.error('Failed to get conversations:', error);
      throw new Error('Failed to retrieve conversations');
    }
  }

  /**
   * Clear all data (for emergency killswitch)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction([STORE_MESSAGES, STORE_CONTACTS, STORE_METADATA], 'readwrite');
      
      await Promise.all([
        tx.objectStore(STORE_MESSAGES).clear(),
        tx.objectStore(STORE_CONTACTS).clear(),
        tx.objectStore(STORE_METADATA).clear()
      ]);
      
      await tx.done;

      // Clear encryption key from memory
      if (this.encryptionKey) {
        sodium.memzero(this.encryptionKey);
        this.encryptionKey = null;
      }

      this.isInitialized = false;
      console.log('All message storage data cleared');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error('Failed to clear storage data');
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    messageCount: number;
    contactCount: number;
    conversationCount: number;
    estimatedSize: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction([STORE_MESSAGES, STORE_CONTACTS, STORE_METADATA], 'readonly');
      
      const [messageCount, contactCount, conversationCount] = await Promise.all([
        tx.objectStore(STORE_MESSAGES).count(),
        tx.objectStore(STORE_CONTACTS).count(),
        tx.objectStore(STORE_METADATA).count()
      ]);

      // Estimate size (rough calculation)
      const estimatedSize = messageCount * 1024 + contactCount * 512 + conversationCount * 256;

      return {
        messageCount,
        contactCount,
        conversationCount,
        estimatedSize
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw new Error('Failed to get storage statistics');
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('conversationId');
    let cursor = await index.openCursor(IDBKeyRange.only(conversationId));

    while (cursor) {
      await store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }

    await tx.done;
    console.log(`🗑️ Deleted all messages for conversation: ${conversationId}`);
  }

  /**
   * Clear all messages for a conversation (alias for deleteConversation)
   */
  async clearMessages(conversationId: string): Promise<void> {
    return this.deleteConversation(conversationId);
  }
}

// Singleton instance
export const messageStorage = new MessageStorage();
export type { EncryptedMessage, Contact, ConversationMetadata }; 