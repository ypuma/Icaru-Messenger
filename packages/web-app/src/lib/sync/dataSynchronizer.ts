import { messageStorage } from '../storage/messageStorage';
import type { EncryptedMessage, Contact } from '../storage/messageStorage';

interface SyncQueueItem {
  id: string;
  type: 'message' | 'contact' | 'message_status';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retries: number;
}

interface ServerMessage {
  id: string;
  senderId: string;
  recipientId: string;
  encryptedContent: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  messageType: 'text' | 'image' | 'file';
  mediaUrl?: string;
}

class DataSynchronizer {
  private syncQueue: SyncQueueItem[] = [];
  private isOnline = navigator.onLine;
  private syncInProgress = false;
  private lastSyncTimestamp = 0;
  private maxRetries = 3;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeSync();
    this.setupEventListeners();
  }

  /**
   * Initialize synchronization
   */
  private initializeSync() {
    // Load sync queue from localStorage
    this.loadSyncQueue();
    
    // Set up periodic sync (every 30 seconds when online)
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.performSync();
      }
    }, 30000);

    // Load last sync timestamp
    const lastSync = localStorage.getItem('secmes_last_sync');
    if (lastSync) {
      this.lastSyncTimestamp = parseInt(lastSync, 10);
    }
  }

  /**
   * Set up event listeners for network and visibility changes
   */
  private setupEventListeners() {
    // Network status changes
    window.addEventListener('online', () => {
      console.log('Network came online - starting sync');
      this.isOnline = true;
      this.performSync();
    });

    window.addEventListener('offline', () => {
      console.log('Network went offline - sync paused');
      this.isOnline = false;
    });

    // Page visibility changes (to sync when tab becomes active)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline && !this.syncInProgress) {
        this.performSync();
      }
    });

    // Before page unload (to save sync queue)
    window.addEventListener('beforeunload', () => {
      this.saveSyncQueue();
    });
  }

  /**
   * Queue an item for synchronization
   */
  queueForSync(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>) {
    const syncItem: SyncQueueItem = {
      ...item,
      id: this.generateSyncId(),
      timestamp: Date.now(),
      retries: 0
    };

    this.syncQueue.push(syncItem);
    this.saveSyncQueue();

    // Try to sync immediately if online
    if (this.isOnline && !this.syncInProgress) {
      this.performSync();
    }
  }

  /**
   * Perform synchronization with server
   */
  async performSync(): Promise<void> {
    if (!this.isOnline || this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;
    console.log('Starting data synchronization...');

    try {
      // First, pull updates from server
      await this.pullUpdatesFromServer();

      // Then, push queued items to server
      await this.pushQueuedItems();

      // Update last sync timestamp
      this.lastSyncTimestamp = Date.now();
      localStorage.setItem('secmes_last_sync', this.lastSyncTimestamp.toString());

      console.log('Data synchronization completed successfully');
    } catch (error) {
      console.error('Synchronization failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Pull updates from server since last sync
   */
  private async pullUpdatesFromServer(): Promise<void> {
    try {
      const response = await fetch(`/api/sync/updates?since=${this.lastSyncTimestamp}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('secmes_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Server sync failed: ${response.status}`);
      }

      const updates = await response.json();

      // Process received messages
      if (updates.messages && updates.messages.length > 0) {
        await this.processIncomingMessages(updates.messages);
      }

      // Process contact updates
      if (updates.contacts && updates.contacts.length > 0) {
        await this.processContactUpdates(updates.contacts);
      }

      // Process message status updates
      if (updates.messageStatuses && updates.messageStatuses.length > 0) {
        await this.processMessageStatusUpdates(updates.messageStatuses);
      }

    } catch (error) {
      console.error('Failed to pull updates from server:', error);
      // Don't throw - allow push to continue
    }
  }

  /**
   * Process incoming messages from server
   */
  private async processIncomingMessages(serverMessages: ServerMessage[]): Promise<void> {
    for (const serverMessage of serverMessages) {
      try {
        // Generate conversation ID from participants
        const conversationId = this.generateConversationId(serverMessage.senderId, serverMessage.recipientId);

        const message: Omit<EncryptedMessage, 'id' | 'createdAt' | 'updatedAt'> = {
          conversationId,
          senderId: serverMessage.senderId,
          recipientId: serverMessage.recipientId,
          encryptedContent: serverMessage.encryptedContent, // Already encrypted
          messageType: serverMessage.messageType,
          timestamp: serverMessage.timestamp,
          status: serverMessage.status,
          mediaUrl: serverMessage.mediaUrl
        };

        await messageStorage.storeMessage(message);
        console.log(`Stored incoming message from ${serverMessage.senderId}`);
      } catch (error) {
        console.error('Failed to process incoming message:', error);
      }
    }
  }

  /**
   * Process contact updates from server
   */
  private async processContactUpdates(contacts: Contact[]): Promise<void> {
    for (const contact of contacts) {
      try {
        // Check if contact already exists
        const existingContact = await messageStorage.getContactByHandle(contact.handle);
        
        if (!existingContact) {
          await messageStorage.storeContact(contact);
          console.log(`Added new contact: ${contact.handle}`);
        } else {
          // Update existing contact if newer
          if (contact.updatedAt > existingContact.updatedAt) {
            // For now, just log - full update logic would be implemented here
            console.log(`Contact ${contact.handle} has updates available`);
          }
        }
      } catch (error) {
        console.error('Failed to process contact update:', error);
      }
    }
  }

  /**
   * Process message status updates from server
   */
  private async processMessageStatusUpdates(statusUpdates: Array<{messageId: string, status: EncryptedMessage['status']}>): Promise<void> {
    for (const update of statusUpdates) {
      try {
        await messageStorage.updateMessageStatus(update.messageId, update.status);
        console.log(`Updated message ${update.messageId} status to ${update.status}`);
      } catch (error) {
        console.error('Failed to update message status:', error);
      }
    }
  }

  /**
   * Push queued items to server
   */
  private async pushQueuedItems(): Promise<void> {
    const itemsToPush = [...this.syncQueue];
    const successfulItems: string[] = [];

    for (const item of itemsToPush) {
      try {
        await this.pushSyncItem(item);
        successfulItems.push(item.id);
        console.log(`Successfully synced ${item.type} item: ${item.id}`);
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        
        // Increment retry count
        item.retries++;
        
        // Remove from queue if max retries exceeded
        if (item.retries >= this.maxRetries) {
          console.warn(`Max retries exceeded for item ${item.id}, removing from queue`);
          successfulItems.push(item.id);
        }
      }
    }

    // Remove successful items from queue
    this.syncQueue = this.syncQueue.filter(item => !successfulItems.includes(item.id));
    this.saveSyncQueue();
  }

  /**
   * Push individual sync item to server
   */
  private async pushSyncItem(item: SyncQueueItem): Promise<void> {
    let endpoint = '';
    let method = 'POST';
    let body = item.data;

    switch (item.type) {
      case 'message':
        endpoint = '/api/messages';
        method = item.action === 'create' ? 'POST' : 'PUT';
        break;
      case 'contact':
        endpoint = '/api/contacts';
        method = item.action === 'create' ? 'POST' : 'PUT';
        break;
      case 'message_status':
        endpoint = `/api/messages/${item.data.messageId}/status`;
        method = 'PATCH';
        body = { status: item.data.status };
        break;
      default:
        throw new Error(`Unknown sync item type: ${item.type}`);
    }

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('secmes_token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Generate conversation ID from two participant IDs
   */
  private generateConversationId(participant1: string, participant2: string): string {
    // Sort participants to ensure consistent conversation IDs
    const sorted = [participant1, participant2].sort();
    return `conv_${sorted[0]}_${sorted[1]}`;
  }

  /**
   * Generate unique sync item ID
   */
  private generateSyncId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save sync queue to localStorage
   */
  private saveSyncQueue(): void {
    try {
      localStorage.setItem('secmes_sync_queue', JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  /**
   * Load sync queue from localStorage
   */
  private loadSyncQueue(): void {
    try {
      const saved = localStorage.getItem('secmes_sync_queue');
      if (saved) {
        this.syncQueue = JSON.parse(saved);
        console.log(`Loaded ${this.syncQueue.length} items from sync queue`);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      this.syncQueue = [];
    }
  }

  /**
   * Force immediate synchronization
   */
  async forcSync(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot sync while offline');
    }

    await this.performSync();
  }

  /**
   * Get sync status information
   */
  getSyncStatus(): {
    isOnline: boolean;
    syncInProgress: boolean;
    queueLength: number;
    lastSyncTimestamp: number;
    lastSyncDate: string;
  } {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      queueLength: this.syncQueue.length,
      lastSyncTimestamp: this.lastSyncTimestamp,
      lastSyncDate: this.lastSyncTimestamp > 0 ? new Date(this.lastSyncTimestamp).toISOString() : 'Never'
    };
  }

  /**
   * Clear sync queue (for emergency killswitch)
   */
  clearSyncQueue(): void {
    this.syncQueue = [];
    localStorage.removeItem('secmes_sync_queue');
    localStorage.removeItem('secmes_last_sync');
    this.lastSyncTimestamp = 0;
    console.log('Sync queue cleared');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.saveSyncQueue();
  }
}

// Singleton instance
export const dataSynchronizer = new DataSynchronizer();
export type { SyncQueueItem, ServerMessage }; 