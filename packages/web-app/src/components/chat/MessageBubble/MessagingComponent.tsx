import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { webSocketClient } from '../../../lib/websocket/websocketClient';
import type { WebSocketMessage, MessageData, ConnectionStatus } from '../../../lib/websocket/websocketClient';
import { SignalCrypto } from '../../../lib/crypto/signalCrypto';
import { PFSIntegration } from '../../../lib/crypto/pfsIntegration';
import { messageStorage } from '../../../lib/storage/messageStorage';
import type { EncryptedMessage } from '../../../lib/storage/messageStorage';
import { sessionManager } from '../../../lib/crypto/sessionManager';
import type { Session } from '../../../lib/crypto/signalCrypto';
import type { RatchetState } from '@secure-messenger/shared';
import { browserStorage } from '../../../lib/storage/browserStorage';
import styles from './MessagingComponent.module.scss';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';

// Define crypto types to match our updated signalCrypto implementation
interface KeyPair {
  publicKey: string;
  privateKey: string;
}

interface SignalKeyBundle {
  identityKey: string;
  signedPreKey: {
    key: string;
    signature: string;
  };
}

interface CipherPacket {
  c: string;
  n: string;
  messageNumber?: number; // For PFS message ordering
  previousChainLength?: number; // For PFS chain management
}

interface Message {
  id: string;
  content: string;
  messageType: string;
  senderHandle: string;
  timestamp: string;
  delivered?: boolean;
  isOwn?: boolean;
  status?: 'pending' | 'sent' | 'delivered';
  encrypted?: boolean;
  encryptedData?: string; // Store original encrypted data for retry
  pfsMessage?: boolean; // Flag to indicate PFS encryption
  plaintext?: string; // Store plaintext for our own message
}

interface MessagingComponentProps {
  currentUser: {
    handle: string;
    sessionToken: string;
    sessionId: string;
    publicKey: string;
    privateKey: string;
  };
  contactHandle: string;
  onClose: () => void;
  minimal?: boolean;
}

const MessagingComponent: React.FC<MessagingComponentProps> = ({
  currentUser,
  contactHandle,
  onClose,
  minimal = false
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    authenticated: false,
    reconnecting: false
  });
  const [session, setSession] = useState<Session | null>(null);
  const [pfsInitialized, setPfsInitialized] = useState<boolean>(false);
  const [encryptionError, setEncryptionError] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const pfsInitializedRef = useRef(pfsInitialized);
  const userHasScrolledRef = useRef<boolean>(false);
  const lastMessageCountRef = useRef<number>(0);
  const shouldAutoScrollRef = useRef<boolean>(false);

  useEffect(() => {
    pfsInitializedRef.current = pfsInitialized;
  }, [pfsInitialized]);

  const conversationId = useMemo(() => {
    return [currentUser.handle, contactHandle].sort((a, b) => a.localeCompare(b)).join('#');
  }, [currentUser.handle, contactHandle]);

  useEffect(() => {
    initChat();
    return () => {
      // Clean up only sending-related handlers
      webSocketClient.offMessage('message_sent', handleMessageSent);
      webSocketClient.offMessage('delivery_receipt', handleDeliveryReceipt);
      webSocketClient.offConnectionChange(handleConnectionChange);
    };
  }, [contactHandle]);

  // Conservative auto-scroll behavior - only scroll when absolutely necessary
  useEffect(() => {
    if (messages.length === 0) return;
    
    const messageCountChanged = messages.length !== lastMessageCountRef.current;
    const newMessagesAdded = messages.length > lastMessageCountRef.current;
    
    // Update message count ref
    lastMessageCountRef.current = messages.length;
    
    // Only consider auto-scroll if new messages were added
    if (!newMessagesAdded) return;
    
    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage?.isOwn;
    
    // Auto-scroll only in these specific cases:
    // 1. It's our own message (we just sent it)
    // 2. Initial load AND we haven't manually scrolled yet
    // 3. We're genuinely at the bottom AND user hasn't manually scrolled
    
    if (isOwnMessage) {
      // Always scroll for our own messages
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom(), 50);
    } else if (!userHasScrolledRef.current && isAtBottom) {
      // Only auto-scroll for incoming messages if user hasn't scrolled manually
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom(), 50);
    } else if (newMessagesAdded && !isAtBottom) {
      // Show scroll button for new messages when not at bottom
      setShowScrollToBottom(true);
    }
  }, [messages]);

  // Refresh messages periodically to pick up messages stored by GlobalMessageService
  useEffect(() => {
    if (!session) return;
    
    const refreshInterval = setInterval(() => {
      loadMessageHistory(session);
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(refreshInterval);
  }, [session]);

  // Initialize scroll position on first load
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0 && lastMessageCountRef.current === 0) {
      // Only on initial load - scroll to bottom and check position
      setTimeout(() => {
        scrollToBottom();
        checkIfAtBottom();
      }, 100);
    }
  }, [messages.length]);

  const initChat = async () => {
    try {
      // Initialize message storage (safe to call multiple times)
      await messageStorage.initialize(currentUser.privateKey);
      await sessionManager.initialize();
      
      console.log('Initializing session and PFS for:', contactHandle);
      const newSession = await sessionManager.getOrCreateSession(contactHandle, currentUser);
      setSession(newSession);

      await initializePFS(newSession);
      await loadMessageHistory(newSession);
      
      // Register only sending-related handlers (GlobalMessageService handles receiving)
      webSocketClient.onMessage('message_sent', handleMessageSent);
      webSocketClient.onMessage('delivery_receipt', handleDeliveryReceipt);
      webSocketClient.onConnectionChange(handleConnectionChange);
      
      setConnectionStatus(webSocketClient.getConnectionStatus());

    } catch (err) {
      console.error('Failed to initialize chat:', err);
      setEncryptionError('Critical error during chat initialization.');
    }
  };

  const initializePFS = async (sessionToInit: Session) => {
    if (!sessionToInit) return;
    
    try {
      console.log('Initializing Perfect Forward Secrecy for:', contactHandle);
      
      const isPfsReady = await PFSIntegration.isPFSInitialized(contactHandle);
      
      if (!isPfsReady) {
        await PFSIntegration.initializePFS(contactHandle, sessionToInit);
        console.log('PFS initialized for:', contactHandle);
      } else {
        console.log('PFS already initialized for:', contactHandle);
      }
      
      const pfsStatus = await PFSIntegration.getPFSStatus(contactHandle);
      console.log('PFS Status:', pfsStatus);
      
      setPfsInitialized(true);
      setEncryptionError('');
    } catch (error) {
      console.error('Failed to initialize PFS:', error);
      setEncryptionError('Failed to initialize Perfect Forward Secrecy');
      throw error;
    }
  };

  const loadMessageHistory = async (sessionForHistory: Session | null) => {
    if (!sessionForHistory) {
      console.warn("Cannot load message history without a session.");
      return;
    }

    try {
      console.log(`Loading message history for ${contactHandle}, conversationId: ${conversationId}`);
      const encryptedMsgs: EncryptedMessage[] = await messageStorage.getMessages(conversationId, 100);
      console.log(`Found ${encryptedMsgs.length} stored messages for ${contactHandle}:`, encryptedMsgs.map(m => ({ id: m.id, from: m.senderId, content: m.plaintext })));
      
      const chronological = [...encryptedMsgs].reverse();
      const decryptedMessages: Message[] = [];

      for (const enc of chronological) {
        const content = enc.plaintext || (enc.senderId === currentUser.handle ? '[Message content unavailable]' : '[Decryption needed]');
        
        const msg: Message = {
          id: enc.id,
          content,
          encrypted: true,
          messageType: enc.messageType,
          senderHandle: enc.senderId,
          timestamp: new Date(enc.timestamp).toISOString(),
          isOwn: enc.senderId === currentUser.handle,
          status: enc.status === 'sending' ? 'pending' : (enc.status === 'read' ? 'delivered' : enc.status as 'sent' | 'delivered'),
          delivered: enc.status === 'delivered' || enc.status === 'read',
        };
        messageIdsRef.current.add(msg.id);
        decryptedMessages.push(msg);
      }

      console.log(`Setze ${decryptedMessages.length} Nachrichten für ${contactHandle} UI`);
      setMessages(decryptedMessages);
    } catch (err) {
      console.error('Fehlgeschlagen, Nachrichtenverlauf zu laden', err);
    }
  };

  const handleMessageSent = (wsMessage: WebSocketMessage) => {
    const data = wsMessage.data as { tempId: string; messageId: string };
    setMessages(prev => prev.map(msg => 
      msg.id === data.tempId 
        ? (() => { messageIdsRef.current.delete(data.tempId); messageIdsRef.current.add(data.messageId); return { ...msg, id: data.messageId, status: 'sent' }; })()
        : msg
    ));

    (async () => {
      try {
        await messageStorage.updateMessageStatus(data.tempId, 'sent');
      } catch (err) {
        console.warn('Failed to update message status in storage', err);
      }
    })();
  };

  const handleDeliveryReceipt = (wsMessage: WebSocketMessage) => {
    const data = wsMessage.data as { messageId: string };
    setMessages(prev => prev.map(msg => 
      msg.id === data.messageId ? { ...msg, delivered: true } : msg
    ));

    (async () => {
      try {
        await messageStorage.updateMessageStatus(data.messageId, 'delivered');
      } catch (err) {
        console.warn('Fehlgeschlagen, Nachricht als geliefert markieren in storage', err);
      }
    })();
  };

  const handleConnectionChange = (status: ConnectionStatus) => {
    setConnectionStatus(status);
    
    if (status.connected && status.authenticated) {
      (async () => {
        const newSession = await sessionManager.getOrCreateSession(contactHandle, currentUser);
        setSession(newSession);
        await initializePFS(newSession);
        await loadMessageHistory(newSession);
      })();
    }
  };

  const sendEncryptedMessage = async (content: string, tempId: string) => {
    if (!session) {
      setEncryptionError('Session not ready. Cannot send message.');
      return;
    }
    
    try {
      let encryptedData: string;
      let usePFS = false;

      if (pfsInitialized) {
        console.log('Encrypting message with PFS');
        const pfsMessage = await PFSIntegration.encryptMessage(contactHandle, content);
        encryptedData = JSON.stringify(pfsMessage);
        usePFS = true;
      } else {
        console.log('Encrypting message with basic crypto');
        const encryptedMessage = await SignalCrypto.encrypt(content, session.keys);
        encryptedData = JSON.stringify(encryptedMessage);
      }
      
      webSocketClient.send({
        type: 'message',
        data: {
          receiverHandle: contactHandle,
          content: '',
          messageType: 'text',
          tempId,
          encrypted: true,
          encryptedData,
          pfsMessage: usePFS,
        },
        timestamp: Date.now(),
      });

      try {
        await messageStorage.storeMessage({
          id: tempId,
          conversationId,
          senderId: currentUser.handle,
          recipientId: contactHandle,
          encryptedContent: encryptedData,
          plaintext: content,
          messageType: 'text',
          timestamp: Date.now(),
          status: 'sending'
        });
      } catch (err) {
        console.error('Failed to persist outgoing message', err);
      }
    } catch (error) {
      console.error('Encryption failed:', error);
      setEncryptionError('Failed to encrypt message.');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !session || newMessage.length > 350) return;
    
    const tempId = `temp_${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: newMessage.trim(),
      messageType: 'text',
      senderHandle: currentUser.handle,
      timestamp: new Date().toISOString(),
      isOwn: true,
      status: 'pending',
      encrypted: true,
      pfsMessage: pfsInitialized,
    };

    // Mark that we should auto-scroll for our own message
    shouldAutoScrollRef.current = true;
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    
    await sendEncryptedMessage(tempMessage.content, tempId);
    messageIdsRef.current.add(tempId);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 350) {
      setNewMessage(value);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newMessage.trim() && newMessage.length <= 350) {
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      shouldAutoScrollRef.current = true; // Mark as programmatic scroll
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShowScrollToBottom(false);
      // Reset manual scroll tracking when user explicitly scrolls to bottom
      userHasScrolledRef.current = false;
      // Update isAtBottom state after scrolling
      setTimeout(() => {
        setIsAtBottom(true);
        shouldAutoScrollRef.current = false;
      }, 100);
    }
  };

  const checkIfAtBottom = () => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    const threshold = 50; // pixels from bottom - reduced for better UX
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    
    setIsAtBottom(isNearBottom);
    setShowScrollToBottom(!isNearBottom && messages.length > 0);
  };

  const handleScroll = () => {
    // Track that user has manually scrolled
    if (!shouldAutoScrollRef.current) {
      userHasScrolledRef.current = true;
    }
    shouldAutoScrollRef.current = false;
    
    checkIfAtBottom();
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const clearChat = async () => {
    if (!currentUser || isClearing) return;

    setIsClearing(true);
    try {
      // Call backend API to clear messages
      const response = await fetch(`${BASE_URL}/api/messages/clear`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${currentUser.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contactHandle
        })
      });

      if (!response.ok) {
        throw new Error('Fehlgeschlagen, Chat zu löschen');
      }

      // Clear local messages
      await messageStorage.clearMessages(conversationId);
      
      // Reset UI state
      setMessages([]);
      messageIdsRef.current.clear();
      setShowClearConfirm(false);

      console.log(`Chat mit ${contactHandle} gelöscht`);

    } catch (error) {
      console.error('Fehlgeschlagen, Chat zu löschen:', error);
      alert('Fehlgeschlagen, Chat zu löschen. Bitte versuchen Sie es erneut.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className={styles.container}>
      <div style={{ height: '8vh', width: '100%', background: 'black', position: 'relative' }}></div>
      
      {/* Header Overlay with Blur */}
      <div className={styles.headerOverlay}></div>
      
      <div className={styles.header}>
        <button onClick={onClose} className={styles.backButton}>
          ←
        </button>
        <button 
          onClick={() => setShowClearConfirm(true)} 
          className={styles.clearButton}
          title="Chat löschen"
          disabled={isClearing}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <polyline points="3 6 5 6 21 6" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  <line x1="10" y1="11" x2="10" y2="17" />
  <line x1="14" y1="11" x2="14" y2="17" />
</svg>

        </button>
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Chat löschen</h3>
            <p>Sind Sie sicher, dass Sie alle Nachrichten mit {contactHandle} löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className={styles.modalActions}>
              <button 
                onClick={() => setShowClearConfirm(false)}
                className={styles.cancelButton}
                disabled={isClearing}
              >
                Abbrechen
              </button>
              <button 
                onClick={clearChat}
                className={styles.clearConfirmButton}
                disabled={isClearing}
              >
                {isClearing ? 'Löschen...' : 'Chat löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div 
        className={styles.messagesContainer}
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className={styles.emptyMessages}>
            <p>Keine Nachrichten</p>
          </div>
        ) : (
          <div className={styles.messagesList}>
            {messages.map((msg, index) => (
              <div key={msg.id || index} className={`${styles.messageWrapper} ${msg.isOwn ? styles.own : styles.other}`}>
                <div
                  className={`${styles.messageBubble} ${msg.isOwn ? styles.own : styles.other}`}
                >
                  <p className={styles.messageText}>{msg.content}</p>
                  <p className={styles.messageTime}>
                    {formatTimestamp(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <button
          onClick={scrollToBottom}
          className={styles.scrollToBottomButton}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}

      {/* Message Input */}
      <div className={styles.messageInputSection}>
        <div className={styles.inputContainer}>
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            className={styles.messageInput}
            placeholder=""
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || newMessage.length > 350}
            className={styles.sendButton}
            title="Nachricht senden"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 4L16 12L8 20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
</svg>
          </button>
          {/* Character Counter */}
          <div className={`${styles.charCounter} ${newMessage.length > 300 ? styles.warning : ''} ${newMessage.length >= 350 ? styles.error : ''}`}>
            {newMessage.length}/350
          </div>
          {!newMessage}
        </div>
      </div>
    </div>
  );
};

export default MessagingComponent;