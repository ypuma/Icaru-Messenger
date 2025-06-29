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
  const [isTyping, setIsTyping] = useState(false);
  const [outgoingQueue, setOutgoingQueue] = useState<Message[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [ratchetState, setRatchetState] = useState<RatchetState | null>(null);
  const [pfsInitialized, setPfsInitialized] = useState<boolean>(false);
  const [encryptionError, setEncryptionError] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());

  // Create a ref to hold the latest PFS status to avoid stale closures in handlers
  const pfsInitializedRef = useRef(pfsInitialized);
  useEffect(() => {
    pfsInitializedRef.current = pfsInitialized;
  }, [pfsInitialized]);

  // Stable conversation id derived from the two handles (lexicographically)
  const conversationId = useMemo(() => {
    return [currentUser.handle, contactHandle].sort((a, b) => a.localeCompare(b)).join('#');
  }, [currentUser.handle, contactHandle]);

  useEffect(() => {
    initChat();
    return () => {
      webSocketClient.offMessage('message', handleIncomingMessage);
      webSocketClient.offMessage('message_sent', handleMessageSent);
      webSocketClient.offMessage('delivery_receipt', handleDeliveryReceipt);
      webSocketClient.offMessage('typing', handleTypingIndicator);
      webSocketClient.offConnectionChange(handleConnectionChange);
    };
  }, [contactHandle]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initChat = async () => {
    try {
      await messageStorage.initialize(currentUser.privateKey);
      await sessionManager.initialize();
      
      console.log('🔄 Initializing session and PFS for:', contactHandle);
      const newSession = await sessionManager.getOrCreateSession(contactHandle, currentUser);
      setSession(newSession);

      // Initialize PFS right after getting the session
      await initializePFS(newSession);

      // Load message history only after PFS is confirmed ready
      await loadMessageHistory(newSession);
      
      // Setup WebSocket listeners last
      webSocketClient.onMessage('message', handleIncomingMessage);
      webSocketClient.onMessage('message_sent', handleMessageSent);
      webSocketClient.onMessage('delivery_receipt', handleDeliveryReceipt);
      webSocketClient.onMessage('typing', handleTypingIndicator);
      webSocketClient.onConnectionChange(handleConnectionChange);
      
      setConnectionStatus(webSocketClient.getConnectionStatus());

    } catch (err) {
      console.error('❌ Failed to initialize chat:', err);
      setEncryptionError('Critical error during chat initialization.');
    }
  };

  const initializePFS = async (sessionToInit: Session) => {
    if (!sessionToInit) return;
    
    try {
      console.log('🔄 Initializing Perfect Forward Secrecy for:', contactHandle);
      
      const isPfsReady = await PFSIntegration.isPFSInitialized(contactHandle);
      
      if (!isPfsReady) {
        await PFSIntegration.initializePFS(contactHandle, sessionToInit);
        console.log('✅ PFS initialized for:', contactHandle);
      } else {
        console.log('🔄 PFS already initialized for:', contactHandle);
      }
      
      const pfsStatus = await PFSIntegration.getPFSStatus(contactHandle);
      console.log('📊 PFS Status:', pfsStatus);
      
      setPfsInitialized(true);
      setEncryptionError('');
    } catch (error) {
      console.error('❌ Failed to initialize PFS:', error);
      setEncryptionError('Failed to initialize Perfect Forward Secrecy');
      throw error; // Re-throw to be caught by initChat
    }
  };

  const loadMessageHistory = async (sessionForHistory: Session | null) => {
    if (!sessionForHistory) {
      console.warn("Cannot load message history without a session.");
      return;
    }

    try {
      // 1. Load the persisted ratchet state ONCE.
      let currentRatchetState = await browserStorage.getRatchetState(contactHandle);
      if (!currentRatchetState) {
        console.warn(`No ratchet state in storage for ${contactHandle}, cannot decrypt history.`);
        const encryptedMsgs: EncryptedMessage[] = await messageStorage.getMessages(conversationId, 100);
        const mapped = encryptedMsgs.reverse().map(enc => {
          const msg: Message = {
            id: enc.id,
            content: '[Encryption session not found]',
            messageType: enc.messageType,
            senderHandle: enc.senderId,
            timestamp: new Date(enc.timestamp).toISOString(),
            isOwn: enc.senderId === currentUser.handle,
            status: 'delivered',
            delivered: true
          };
          messageIdsRef.current.add(msg.id);
          return msg;
        });
        setMessages(mapped);
        return;
      }

      const encryptedMsgs: EncryptedMessage[] = await messageStorage.getMessages(conversationId, 100);
      const chronological = [...encryptedMsgs].reverse();
      const decryptedMessages: Message[] = [];

      // 2. Process messages SERIALLY.
      for (const enc of chronological) {
        let content = '[Decrypting...]';
        let decrypted = false;
        let isPfsFormat = false;

        // If plaintext is available, use it directly. This is the primary path.
        if (enc.plaintext) {
          content = enc.plaintext;
          decrypted = true;
          // We can still check the format for the UI tag
          try {
            isPfsFormat = JSON.parse(enc.encryptedContent)?.messageNumber !== undefined;
          } catch {}
        } else if (enc.senderId === currentUser.handle) {
          // Own message without plaintext is an error, but show something.
          content = '[Message content unavailable]';
        } else {
          // Fallback decryption for incoming messages that failed to store plaintext.
          try {
            const parsedData = JSON.parse(enc.encryptedContent);
            isPfsFormat = parsedData.messageNumber !== undefined;

            // Try PFS decryption first
            if (pfsInitializedRef.current && isPfsFormat) {
              try {
                // 3. Use the state directly and update it for the next iteration.
                const result = await SignalCrypto.decryptWithPFS(parsedData, currentRatchetState);
                content = result.message;
                currentRatchetState = result.newRatchetState; // Update for next loop
                decrypted = true;
              } catch (pfsError) {
                console.warn(`⚠️ PFS decryption failed for stored message ${enc.id}, trying basic.`, pfsError);
              }
            }
            
            // Fallback to basic decryption if PFS failed or was not applicable
            if (!decrypted && parsedData.c && parsedData.n) {
              try {
                content = await SignalCrypto.decrypt(parsedData, sessionForHistory.keys);
                decrypted = true;
              } catch (err) {
                console.warn(`⚠️ Basic decryption failed for stored message ${enc.id}.`, err);
              }
            }
            
            if (!decrypted) {
              content = '[Decryption Failed]';
            }
          } catch (parseError) {
            console.error(`❌ Failed to parse stored message ${enc.id}:`, parseError);
            content = '[Parse Error]';
          }
        }

        const msg: Message = {
          id: enc.id,
          content,
          encrypted: true,
          encryptedData: decrypted ? undefined : enc.encryptedContent,
          messageType: enc.messageType,
          senderHandle: enc.senderId,
          timestamp: new Date(enc.timestamp).toISOString(),
          isOwn: enc.senderId === currentUser.handle,
          status: enc.status === 'sending' ? 'pending' : (enc.status === 'read' ? 'delivered' : enc.status as 'sent' | 'delivered'),
          delivered: enc.status === 'delivered' || enc.status === 'read',
          pfsMessage: isPfsFormat && decrypted
        };
        messageIdsRef.current.add(msg.id);
        decryptedMessages.push(msg);
      }

      setMessages(decryptedMessages);

      // 4. After decrypting all history, update the live state in PFSIntegration cache and storage.
      await PFSIntegration.updateRatchetState(contactHandle, currentRatchetState);

    } catch (err) {
      console.error('Failed loading message history', err);
    }
  };

  const handleIncomingMessage = async (wsMessage: WebSocketMessage) => {
    const messageData = wsMessage.data as MessageData & { encryptedData?: string; encrypted?: boolean; pfsMessage?: boolean };

    // Ensure the message is for the currently active chat window.
    if (messageData.senderHandle !== contactHandle) {
      return; // Ignore messages not intended for this conversation.
    }

    // Atomically check for duplicates and reserve the ID to prevent race conditions.
    if (!messageData.id || messageIdsRef.current.has(messageData.id)) {
      return; // Ignore invalid or duplicate messages.
    }
    if (messageData.senderHandle === currentUser.handle) {
      return; // Ignore echos of our own messages.
    }
    messageIdsRef.current.add(messageData.id);

    console.log('📨 Incoming message:', { from: messageData.senderHandle, encrypted: messageData.encrypted });

    let decryptedContent: string | undefined = undefined;
    let finalContent: string;
    let placeholder: string | null = null;

    if (messageData.encrypted && messageData.encryptedData) {
      placeholder = '[Decrypting...]';
      try {
        if (messageData.pfsMessage && pfsInitializedRef.current) {
          const pfsMessage = JSON.parse(messageData.encryptedData);
          const result = await PFSIntegration.decryptMessage(messageData.senderHandle, pfsMessage);
          decryptedContent = result;
          console.log('✅ PFS Message decrypted:', decryptedContent.slice(0, 50) + '...');
        } else {
          const cachedSession = sessionManager.getCachedSession(messageData.senderHandle);
          if (cachedSession) {
            const encryptedSignalMessage: CipherPacket = JSON.parse(messageData.encryptedData);
            decryptedContent = await SignalCrypto.decrypt(encryptedSignalMessage, cachedSession.keys);
            console.log('✅ Basic Message decrypted:', decryptedContent.slice(0, 50) + '...');
          } else {
            placeholder = '[Establishing secure session...]';
          }
        }
      } catch (error) {
        console.error('❌ Error handling encrypted message:', error);
        placeholder = '[Decryption Error]';
      }
    }

    finalContent = decryptedContent || placeholder || (messageData.content || '');

    const newMessage: Message = {
      id: messageData.id || `msg_${Date.now()}`,
      content: finalContent,
      messageType: messageData.messageType || 'text',
      senderHandle: messageData.senderHandle,
      timestamp: messageData.timestamp || new Date().toISOString(),
      isOwn: false,
      encrypted: messageData.encrypted,
      encryptedData: decryptedContent ? undefined : messageData.encryptedData,
      pfsMessage: messageData.pfsMessage,
      plaintext: decryptedContent,
    };

    setMessages(prevMsgs => [...prevMsgs, newMessage]);

    // Store the fully decrypted message
    if (messageData.encrypted && messageData.encryptedData) {
      await messageStorage.storeMessage({
        id: newMessage.id,
        conversationId,
        senderId: messageData.senderHandle,
        recipientId: currentUser.handle,
        encryptedContent: messageData.encryptedData,
        plaintext: decryptedContent,
        messageType: (messageData.messageType as 'text' | 'image' | 'file') || 'text',
        timestamp: Date.now(),
        status: 'delivered'
      });
    }

    // Send delivery receipt
    if (messageData.encrypted) {
      webSocketClient.send({ type: 'delivery_receipt', data: { messageId: messageData.id, receiverHandle: messageData.senderHandle }, timestamp: Date.now() });
    }
  };

  const handleMessageSent = (wsMessage: WebSocketMessage) => {
    const data = wsMessage.data as { tempId: string; messageId: string };
    setMessages(prev => prev.map(msg => 
      msg.id === data.tempId 
        ? (() => { messageIdsRef.current.delete(data.tempId); messageIdsRef.current.add(data.messageId); return { ...msg, id: data.messageId, status: 'sent' }; })()
        : msg
    ));

    // Update storage: change id and status
    (async () => {
      try {
        // Delete old temp entry if any
        await messageStorage.updateMessageStatus(data.tempId, 'sent');
        // In case id changed, we could duplicate but for simplicity just update status
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
        console.warn('Failed to mark delivered in storage', err);
      }
    })();
  };

  const handleTypingIndicator = (wsMessage: WebSocketMessage) => {
    // Typing indicator logic can be re-added later.
  };

  const handleConnectionChange = (status: ConnectionStatus) => {
    setConnectionStatus(status);
    
    if (status.connected && status.authenticated) {
      // Process any queued messages
      outgoingQueue.forEach(msg => {
        if (msg.encrypted) {
          sendEncryptedMessage(msg.content, msg.id);
        }
      });
      setOutgoingQueue([]);
      
      // Re-initialize and load history on reconnect
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
        // Use PFS encryption
        console.log('🔐 Encrypting message with PFS:', {
          to: contactHandle,
          contentLength: content.length
        });
        
        const pfsMessage = await PFSIntegration.encryptMessage(contactHandle, content);
        encryptedData = JSON.stringify(pfsMessage);
        usePFS = true;
        
        console.log('📤 PFS encrypted message prepared:', {
          to: contactHandle,
          tempId,
          messageNumber: pfsMessage.messageNumber,
          chainLength: pfsMessage.previousChainLength
        });
      } else {
        // Fallback to basic encryption
        console.log('🔐 Encrypting message with basic crypto:', {
          to: contactHandle,
          txKeyPreview: Array.from(session.keys.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
          contentLength: content.length
        });
        
        const encryptedMessage = await SignalCrypto.encrypt(content, session.keys);
        encryptedData = JSON.stringify(encryptedMessage);
        
        console.log('📤 Basic encrypted message prepared:', {
          to: contactHandle,
          tempId
        });
      }
      
      webSocketClient.send({
        type: 'message',
        data: {
          receiverHandle: contactHandle,
          content: '', // No plaintext content
          messageType: 'text',
          tempId,
          encrypted: true,
          encryptedData,
          pfsMessage: usePFS,
        },
        timestamp: Date.now(),
      });

      // Persist to local storage (status: sending)
      try {
        await messageStorage.storeMessage({
          id: tempId,
          conversationId,
          senderId: currentUser.handle,
          recipientId: contactHandle,
          encryptedContent: encryptedData,
          plaintext: content, // Store plaintext for our own message
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
    if (!newMessage.trim() || !session) return;
    
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

    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    
    await sendEncryptedMessage(tempMessage.content, tempId);
    messageIdsRef.current.add(tempId);
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
  };

  const stopTyping = () => {
    // Typing indicator logic can be re-added later.
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageStatusIndicator = (message: Message) => {
    if (!message.isOwn) return null;

    if (message.delivered) {
      return <span className={styles.statusIndicatorMessage}>[c]</span>;
    }
    
    return null;
  };

  const getConnectionStatusColor = () => {
    if (connectionStatus.reconnecting) return styles.connectionYellow;
    if (connectionStatus.connected && connectionStatus.authenticated) return styles.connectionGreen;
    return styles.connectionRed;
  };

  const getConnectionStatusText = () => {
    if (connectionStatus.reconnecting) return 'Reconnecting...';
    if (connectionStatus.connected && connectionStatus.authenticated) {
      return 'Connected';
    }
    return 'Disconnected';
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      {!minimal && (
      <div className={styles.header}>
        <div>
          <h3 className={styles.headerTitle}>
            {contactHandle}
          </h3>
          <div className={styles.connectionStatus}>
            <p className={`${styles.statusText} ${getConnectionStatusColor()}`}>
              {getConnectionStatusText()}
            </p>
            {pfsInitialized && (
              <span className={`${styles.statusIndicator} ${styles.pfsActive}`}>
                🔒 PFS Active
              </span>
            )}
            {session && !pfsInitialized && (
              <span className={`${styles.statusIndicator} ${styles.basicE2ee}`}>
                🔒 E2EE (Basic)
              </span>
            )}
            {!session && (
              <span className={`${styles.statusIndicator} ${styles.noE2ee}`}>
                🔓 No E2EE
              </span>
            )}
          </div>
          {encryptionError && (
            <p className={styles.errorText}>{encryptionError}</p>
          )}
        </div>
      </div>
      )}

      {/* Messages */}
      <div className={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`${styles.messageWrapper} ${msg.isOwn ? styles.messageWrapperOwn : styles.messageWrapperOther}`}
          >
            <div className={`${styles.messageBubble} ${msg.isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther}`}>
              <p className={styles.messageContent}>{msg.content}</p>
              <div className={`${styles.messageFooter} ${msg.isOwn ? styles.messageFooterOwn : styles.messageFooterOther}`}>
                <span className={styles.timestamp}>{formatTimestamp(msg.timestamp)}</span>
                {getMessageStatusIndicator(msg)}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputContainer}>
        <div className={styles.inputWrapper}>
          <textarea
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={
              !connectionStatus.authenticated
                ? 'Disconnected...'
                : !session
                  ? 'Establishing encryption...'
                  : 'Type a message...'
            }
            rows={1}
            className={styles.textInput}
            disabled={!connectionStatus.authenticated || !session}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !connectionStatus.authenticated || !session}
            className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center justify-center w-9 h-9 
                       bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full shadow-md hover:brightness-110 active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Send Message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessagingComponent;