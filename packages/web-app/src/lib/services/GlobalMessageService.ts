import { webSocketClient } from '../websocket/websocketClient';
import type { WebSocketMessage, MessageData } from '../websocket/websocketClient';
import { SignalCrypto } from '../crypto/signalCrypto';
import { PFSIntegration } from '../crypto/pfsIntegration';
import { messageStorage } from '../storage/messageStorage';
import { sessionManager } from '../crypto/sessionManager';

interface User {
  handle: string;
  sessionToken: string;
  sessionId: string;
  publicKey: string;
  privateKey: string;
}

interface CipherPacket {
  c: string;
  n: string;
  messageNumber?: number;
  previousChainLength?: number;
}

class GlobalMessageService {
  private static instance: GlobalMessageService | null = null;
  private currentUser: User | null = null;
  private isInitialized = false;
  private messageHandler = this.handleIncomingMessage.bind(this);

  // Singleton pattern
  static getInstance(): GlobalMessageService {
    if (!GlobalMessageService.instance) {
      GlobalMessageService.instance = new GlobalMessageService();
    }
    return GlobalMessageService.instance;
  }

  async initialize(user: User): Promise<void> {
    if (this.isInitialized) {
      console.log('GlobalMessageService already initialized');
      return;
    }

    console.log('Initializing GlobalMessageService for', user.handle);
    
    this.currentUser = user;

    try {
      // Initialize storage
      await messageStorage.initialize(user.privateKey);
      await sessionManager.initialize();

      // Register WebSocket message handler
      webSocketClient.onMessage('message', this.messageHandler);
      
      // Register handler for contact_added notifications for auto-session init
      webSocketClient.onMessage('contact_added', this.handleContactAdded.bind(this));

      this.isInitialized = true;
      console.log('GlobalMessageService initialized successfully');
    } catch (error) {
              console.error('GlobalMessageService initialization failed:', error);
      throw error;
    }
  }

  private async handleIncomingMessage(wsMessage: WebSocketMessage): Promise<void> {
    if (!this.currentUser) {
      console.warn('No current user, ignoring message');
      return;
    }

    const messageData = wsMessage.data as MessageData & { 
      encryptedData?: string; 
      encrypted?: boolean; 
      pfsMessage?: boolean;
    };

    // Skip our own messages
    if (messageData.senderHandle === this.currentUser.handle) {
      return;
    }

    if (!messageData.id) {
      console.warn('Message without ID, ignoring');
      return;
    }

    console.log('GlobalMessageService: Incoming message from', messageData.senderHandle);

    let decryptedContent: string | undefined = undefined;

    // Decrypt message if encrypted
    if (messageData.encrypted && messageData.encryptedData) {
      try {
        console.log('Getting/creating session for', messageData.senderHandle);
        
        // Ensure we have a proper session for the sender
        const senderSession = await sessionManager.getOrCreateSession(
          messageData.senderHandle, 
          this.currentUser
        );

        console.log('Session ready for', messageData.senderHandle, 'attempting decryption');

        if (messageData.pfsMessage) {
          const pfsMessage = JSON.parse(messageData.encryptedData);
          decryptedContent = await PFSIntegration.decryptMessage(
            messageData.senderHandle, 
            pfsMessage
          );
                      console.log('PFS message decrypted from', messageData.senderHandle);
        } else {
          const encryptedSignalMessage: CipherPacket = JSON.parse(messageData.encryptedData);
          decryptedContent = await SignalCrypto.decrypt(
            encryptedSignalMessage, 
            senderSession.keys
          );
                      console.log('Basic message decrypted from', messageData.senderHandle);
        }
      } catch (error) {
                  console.error('Decryption failed for', messageData.senderHandle, ':', error);
        
        // Try to recover by refreshing the session
        try {
                      console.log('Attempting session recovery for', messageData.senderHandle);
          await sessionManager.initialize(); // Re-initialize session manager
          const freshSession = await sessionManager.getOrCreateSession(
            messageData.senderHandle, 
            this.currentUser
          );
          
          if (messageData.pfsMessage) {
            const pfsMessage = JSON.parse(messageData.encryptedData);
            decryptedContent = await PFSIntegration.decryptMessage(
              messageData.senderHandle, 
              pfsMessage
            );
                          console.log('PFS message decrypted after session recovery');
          } else {
            const encryptedSignalMessage: CipherPacket = JSON.parse(messageData.encryptedData);
            decryptedContent = await SignalCrypto.decrypt(
              encryptedSignalMessage, 
              freshSession.keys
            );
                          console.log('Basic message decrypted after session recovery');
          }
        } catch (recoveryError) {
                      console.error('Session recovery also failed:', recoveryError);
        }
      }
    }

    const finalContent = decryptedContent || messageData.content || '[Decryption Failed]';

    // Store the message
    const conversationId = [this.currentUser.handle, messageData.senderHandle]
      .sort((a, b) => a.localeCompare(b))
      .join('#');

    try {
      await messageStorage.storeMessage({
        id: messageData.id,
        conversationId,
        senderId: messageData.senderHandle,
        recipientId: this.currentUser.handle,
        encryptedContent: messageData.encryptedData || '',
        plaintext: decryptedContent,
        messageType: (messageData.messageType as 'text' | 'image' | 'file') || 'text',
        timestamp: Date.now(),
        status: 'delivered'
      });

                console.log('GlobalMessageService: Message stored from', messageData.senderHandle);
    } catch (error) {
              console.error('Failed to store message:', error);
    }

    // Send delivery receipt
    if (messageData.encrypted) {
      webSocketClient.send({ 
        type: 'delivery_receipt', 
        data: { 
          messageId: messageData.id, 
          receiverHandle: messageData.senderHandle 
        }, 
        timestamp: Date.now() 
      });
    }
  }

  private async handleContactAdded(wsMessage: WebSocketMessage): Promise<void> {
    if (!this.currentUser) {
              console.warn('No current user, ignoring contact_added notification');
      return;
    }

    const { addedByHandle, addedByPublicKey } = wsMessage.data;
    
    if (!addedByHandle || !addedByPublicKey) {
              console.warn('Invalid contact_added notification data');
      return;
    }

          console.log('Someone added you as contact:', addedByHandle, '- auto-initializing session');

    try {
      // Auto-create session with the person who added you
      const session = await sessionManager.getOrCreateSession(addedByHandle, this.currentUser);
                console.log('Auto-initialized session with', addedByHandle);

      // Also initialize PFS for this contact
      const isPfsReady = await PFSIntegration.isPFSInitialized(addedByHandle);
      if (!isPfsReady) {
        await PFSIntegration.initializePFS(addedByHandle, session);
                    console.log('Auto-initialized PFS with', addedByHandle);
          } else {
            console.log('PFS already initialized with', addedByHandle);
          }
          
          console.log('One-way messaging enabled with', addedByHandle);
    } catch (error) {
              console.error('Failed to auto-initialize session/PFS with', addedByHandle, ':', error);
    }
  }

  cleanup(): void {
    if (this.isInitialized) {
      console.log('Cleaning up GlobalMessageService');
      webSocketClient.offMessage('message', this.messageHandler);
      webSocketClient.offMessage('contact_added', this.handleContactAdded.bind(this));
      this.isInitialized = false;
      this.currentUser = null;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.currentUser !== null;
  }
}

// Export singleton instance
export const globalMessageService = GlobalMessageService.getInstance(); 