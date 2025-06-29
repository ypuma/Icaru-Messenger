import React, { useState, useEffect } from 'react';
import _sodium from 'libsodium-wrappers';
const sodium = _sodium;
import { formatHandle } from '../../../lib/utils/handle';

interface Contact {
  handle: string;
  formattedHandle: string;
  publicKey: string;
  lastMessage?: string;
  lastMessageTime?: number;
  isOnline?: boolean;
}

interface Message {
  id: string;
  fromHandle: string;
  toHandle: string;
  encryptedContent: string;
  timestamp: number;
  iv: string;
  signature: string;
}

interface DecryptedMessage {
  id: string;
  fromHandle: string;
  toHandle: string;
  content: string;
  timestamp: number;
  isSent: boolean;
}

const SecureMessaging: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<{ handle: string; privateKey: string; publicKey: string } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize user data from localStorage
  useEffect(() => {
    const initializeUser = async () => {
      const handle = localStorage.getItem('secmes_handle');
      const privateKey = localStorage.getItem('secmes_private_key');
      const publicKey = localStorage.getItem('secmes_public_key');

      if (handle && privateKey && publicKey) {
        setCurrentUser({ handle, privateKey, publicKey });
        loadContacts();
      }
    };

    initializeUser();
  }, []);

  // Initialize sodium
  useEffect(() => {
    sodium.ready.then(() => {
      console.log('Sodium cryptography ready for messaging');
    });
  }, []);

  const loadContacts = async () => {
    try {
      // Load contacts from localStorage or API
      const savedContacts = localStorage.getItem('secmes_contacts');
      if (savedContacts) {
        setContacts(JSON.parse(savedContacts));
      }

      // In a real app, fetch from API
      // const response = await fetch('/api/contacts');
      // const contactsData = await response.json();
      // setContacts(contactsData);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  // Function kept for future API integration
  // const addContact = async (contactHandle: string, publicKey: string) => {
  //   try {
  //     const newContact: Contact = {
  //       handle: contactHandle,
  //       formattedHandle: formatHandle(contactHandle),
  //       publicKey,
  //       isOnline: false
  //     };

  //     const updatedContacts = [...contacts, newContact];
  //     setContacts(updatedContacts);
  //     localStorage.setItem('secmes_contacts', JSON.stringify(updatedContacts));

  //     // In a real app, save to API
  //     // await fetch('/api/contacts', {
  //     //   method: 'POST',
  //     //   headers: { 'Content-Type': 'application/json' },
  //     //   body: JSON.stringify(newContact)
  //     // });

  //   } catch (error) {
  //     setError('Failed to add contact');
  //     console.error('Add contact error:', error);
  //   }
  // };

  const encryptMessage = async (content: string, recipientPublicKey: string): Promise<{ encrypted: string; iv: string; signature: string }> => {
    try {
      await sodium.ready;

      // Parse the composite public key
      const publicKeyData = JSON.parse(recipientPublicKey);
      const senderPrivateKeyData = JSON.parse(currentUser!.privateKey);

      // Generate a random nonce/IV
      const iv = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
      
      // Convert keys from hex
      const recipientPubKey = sodium.from_hex(publicKeyData.encrypt);
      const senderPrivKey = sodium.from_hex(senderPrivateKeyData.encrypt);

      // Encrypt the message
      const messageBytes = sodium.from_string(content);
      const encrypted = sodium.crypto_box_easy(messageBytes, iv, recipientPubKey, senderPrivKey);

      // Sign the encrypted message
      const signPrivKey = sodium.from_hex(senderPrivateKeyData.sign);
      const signature = sodium.crypto_sign_detached(encrypted, signPrivKey);

      return {
        encrypted: sodium.to_hex(encrypted),
        iv: sodium.to_hex(iv),
        signature: sodium.to_hex(signature)
      };
    } catch (error) {
      console.error('Sodium encryption failed:', error);
      throw new Error('Message encryption failed - Sodium required');
    }
  };

  const decryptMessage = async (encryptedData: { encrypted: string; iv: string; signature: string }, senderPublicKey: string): Promise<string> => {
    try {
      await sodium.ready;

      // Parse the composite keys
      const senderPublicKeyData = JSON.parse(senderPublicKey);
      const recipientPrivateKeyData = JSON.parse(currentUser!.privateKey);

      // Convert from hex
      const encrypted = sodium.from_hex(encryptedData.encrypted);
      const iv = sodium.from_hex(encryptedData.iv);
      const signature = sodium.from_hex(encryptedData.signature);
      const senderSignPubKey = sodium.from_hex(senderPublicKeyData.sign);
      const recipientEncPrivKey = sodium.from_hex(recipientPrivateKeyData.encrypt);
      const senderEncPubKey = sodium.from_hex(senderPublicKeyData.encrypt);

      // Verify signature
      const isValid = sodium.crypto_sign_verify_detached(signature, encrypted, senderSignPubKey);
      if (!isValid) {
        throw new Error('Message signature verification failed');
      }

      // Decrypt the message
      const decrypted = sodium.crypto_box_open_easy(encrypted, iv, senderEncPubKey, recipientEncPrivKey);
      return sodium.to_string(decrypted);
    } catch (error) {
      console.error('Sodium decryption failed:', error);
      throw new Error('Message decryption failed - check keys and signature');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedContact || !currentUser) return;

    setIsLoading(true);
    try {
      // Encrypt the message
      const { encrypted, iv, signature } = await encryptMessage(newMessage, selectedContact.publicKey);

      const message: Message = {
        id: crypto.randomUUID(),
        fromHandle: currentUser.handle,
        toHandle: selectedContact.handle,
        encryptedContent: encrypted,
        timestamp: Date.now(),
        iv,
        signature
      };

      // In a real app, send to server
      // await fetch('/api/messages', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(message)
      // });

      // Add to local messages
      const decryptedMessage: DecryptedMessage = {
        id: message.id,
        fromHandle: currentUser.handle,
        toHandle: selectedContact.handle,
        content: newMessage,
        timestamp: message.timestamp,
        isSent: true
      };

      setMessages(prev => [...prev, decryptedMessage]);
      setNewMessage('');
      
      // Save to localStorage
      const allMessages = JSON.parse(localStorage.getItem('secmes_messages') || '[]');
      allMessages.push(message);
      localStorage.setItem('secmes_messages', JSON.stringify(allMessages));

    } catch (error) {
      setError('Failed to send message');
      console.error('Send message error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (contact: Contact) => {
    try {
      setSelectedContact(contact);
      
      // Load messages from localStorage
      const allMessages = JSON.parse(localStorage.getItem('secmes_messages') || '[]');
      const contactMessages = allMessages.filter((msg: Message) => 
        (msg.fromHandle === currentUser?.handle && msg.toHandle === contact.handle) ||
        (msg.fromHandle === contact.handle && msg.toHandle === currentUser?.handle)
      );

      // Decrypt messages
      const decrypted: DecryptedMessage[] = [];
      for (const msg of contactMessages) {
        try {
          let content: string;
          let isSent: boolean;
          
          if (msg.fromHandle === currentUser?.handle) {
            // We sent this message - decrypt using recipient's public key
            content = await decryptMessage(
              { encrypted: msg.encryptedContent, iv: msg.iv, signature: msg.signature },
              contact.publicKey
            );
            isSent = true;
          } else {
            // We received this message - decrypt using sender's public key  
            content = await decryptMessage(
              { encrypted: msg.encryptedContent, iv: msg.iv, signature: msg.signature },
              contact.publicKey
            );
            isSent = false;
          }

          decrypted.push({
            id: msg.id,
            fromHandle: msg.fromHandle,
            toHandle: msg.toHandle,
            content,
            timestamp: msg.timestamp,
            isSent
          });
        } catch (error) {
          console.error('Failed to decrypt message:', error);
          // Skip corrupted messages
        }
      }

      // Sort by timestamp
      decrypted.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(decrypted);

    } catch (error) {
      setError('Failed to load messages');
      console.error('Load messages error:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Function kept for future use
  // const formatDate = (timestamp: number) => {
  //   return new Date(timestamp).toLocaleDateString();
  // };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="bg-white/30 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-10 w-full max-w-sm text-center">
          <h2 className="text-2xl font-extralight text-slate-800 mb-4">No Account Found</h2>
          <p className="text-slate-600 font-light mb-6">Please create an account first to use secure messaging.</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-white/40 backdrop-blur-sm text-slate-800 font-medium rounded-2xl hover:bg-white/50 transition-all duration-300 shadow-lg hover:shadow-xl border border-white/30"
          >
            Go to Account Creation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Contacts Sidebar */}
      <div className="w-1/3 bg-white border-r border-gray-300 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Secure Messages</h2>
          {currentUser && (
            <p className="text-sm text-gray-600">@{formatHandle(currentUser.handle)}</p>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p>No contacts yet</p>
              <p className="text-sm">Add contacts to start messaging</p>
            </div>
          ) : (
            contacts.map((contact) => (
              <div
                key={contact.handle}
                onClick={() => loadMessages(contact)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedContact?.handle === contact.handle ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">@{contact.formattedHandle}</p>
                    {contact.lastMessage && (
                      <p className="text-sm text-gray-600 truncate">{contact.lastMessage}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {contact.isOnline && (
                      <div className="w-2 h-2 bg-green-500 rounded-full mb-1"></div>
                    )}
                    {contact.lastMessageTime && (
                      <p className="text-xs text-gray-500">
                        {formatTime(contact.lastMessageTime)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">@{selectedContact.formattedHandle}</h3>
                  <p className="text-sm text-gray-600">
                    {selectedContact.isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">End-to-end encrypted</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isSent ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.isSent
                        ? 'bg-blue-500 text-white'
                        : 'bg-white border border-gray-300 text-gray-900'
                    }`}
                  >
                    <p>{message.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.isSent ? 'text-blue-100' : 'text-gray-500'
                      }`}
                    >
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-200">
              {error && (
                <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !newMessage.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-lg">Select a contact to start messaging</p>
              <p className="text-sm">All messages are end-to-end encrypted</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecureMessaging; 