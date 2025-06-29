import React, { useState, useEffect } from 'react';
import MessagingComponent from './MessageBubble/MessagingComponent';
import { webSocketClient, type ConnectionStatus } from '../../lib/websocket/websocketClient';
import { sessionManager } from '../../lib/crypto/sessionManager';
import { deleteContact } from '../../lib/api/contactApi';
import { messageStorage } from '../../lib/storage/messageStorage';
import { PFSIntegration } from '../../lib/crypto/pfsIntegration';

const API_BASE_URL = 'http://localhost:3001';

interface Contact {
  id: string;
  handle: string;
  verified: boolean;
  lastMessage?: {
    content: string;
    timestamp: string;
    isOwn: boolean;
  };
  unreadCount?: number;
}

interface Conversation {
  contactHandle: string;
  contact: Contact;
  lastMessage?: {
    content: string;
    timestamp: string;
    isOwn: boolean;
  };
  unreadCount: number;
}

interface ActiveTab {
  contactHandle: string;
  contact: Contact;
}

interface ChatInterfaceProps {
  currentUser: {
    handle: string;
    sessionToken: string;
    sessionId: string;
    publicKey: string;
    privateKey: string;
  };
  /** Show the New Chat view on initial render */
  initialShowNewChat?: boolean;
  /** Contact handle to open immediately */
  startContactHandle?: string;
  /** Callback to navigate back to Home screen */
  onBackHome?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ currentUser, initialShowNewChat = false, startContactHandle, onBackHome }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeTabs, setActiveTabs] = useState<ActiveTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [showNewChat, setShowNewChat] = useState(initialShowNewChat);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [_showAddContact, setShowAddContact] = useState(false);
  const [_newContactHandle, setNewContactHandle] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(webSocketClient.getConnectionStatus());

  useEffect(() => {
    fetchContacts();
    fetchConversations();

    const handleConnectionChange = (status: ConnectionStatus) => {
      setConnectionStatus(status);
      if (status.connected && status.authenticated) {
        // Refresh data on reconnect
        fetchContacts();
        fetchConversations();
      } else if (!status.connected) {
        // Clear sessions when disconnected/logged out
        sessionManager.clearAllSessions();
        setActiveTabs([]);
        setActiveTabIndex(-1);
      }
    };

    webSocketClient.onConnectionChange(handleConnectionChange);

    return () => {
      webSocketClient.offConnectionChange(handleConnectionChange);
    };
  }, []);

  // Preselect contact when provided
  useEffect(() => {
    if (startContactHandle) {
      // If contacts loaded, attempt selection
      if (contacts.some(c => c.handle === startContactHandle) || conversations.some(c => c.contactHandle === startContactHandle)) {
        handleContactSelect(startContactHandle);
      }
    }
  }, [startContactHandle, contacts, conversations]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) {
        console.error('No session found');
        return;
      }
      
      let session;
      try {
        session = JSON.parse(sessionData);
      } catch (error) {
        console.error('Failed to parse session data:', error);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
      } else {
        console.error('Failed to fetch contacts:', response.status);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async () => {
    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) {
        console.error('No session found');
        return;
      }
      
      let session;
      try {
        session = JSON.parse(sessionData);
      } catch (error) {
        console.error('Failed to parse session data:', error);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      } else {
        console.error('Failed to fetch conversations:', response.status);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const handleContactSelect = (contactHandle: string) => {
    const contact = contacts.find(c => c.handle === contactHandle) || 
                   conversations.find(c => c.contactHandle === contactHandle)?.contact;
    
    if (!contact) {
      console.error('Contact not found:', contactHandle);
      return;
    }

    // Check if tab already exists
    const existingTabIndex = activeTabs.findIndex(tab => tab.contactHandle === contactHandle);
    
    if (existingTabIndex >= 0) {
      // Switch to existing tab
      setActiveTabIndex(existingTabIndex);
    } else {
      // Create new tab
      const newTab: ActiveTab = {
        contactHandle,
        contact
      };
      const newTabs = [...activeTabs, newTab];
      setActiveTabs(newTabs);
      setActiveTabIndex(newTabs.length - 1);
    }
    
    setShowNewChat(false);
  };

  const handleNewChat = () => {
    setShowNewChat(true);
    setActiveTabIndex(-1);
  };

  const handleBackToList = () => {
    setActiveTabIndex(-1);
    setShowNewChat(false);
    fetchConversations(); // Refresh conversations
  };

  const handleCloseTab = (tabIndex: number) => {
    const newTabs = activeTabs.filter((_, index) => index !== tabIndex);
    setActiveTabs(newTabs);
    
    if (activeTabIndex === tabIndex) {
      // If closing active tab, switch to previous or next tab
      if (newTabs.length === 0) {
        setActiveTabIndex(-1);
      } else if (tabIndex === 0) {
        setActiveTabIndex(0);
      } else {
        setActiveTabIndex(tabIndex - 1);
      }
    } else if (activeTabIndex > tabIndex) {
      // Adjust active tab index if a tab before it was closed
      setActiveTabIndex(activeTabIndex - 1);
    }
  };

  const handleTabSelect = (tabIndex: number) => {
    setActiveTabIndex(tabIndex);
    setShowNewChat(false);
  };

  const handleDeleteContact = async (contactHandle: string) => {
    // 1. Confirm with the user
    if (!window.confirm(`Are you sure you want to delete ${contactHandle}? This action cannot be undone.`)) {
      return;
    }

    try {
      // 2. Call the API to delete the contact
      await deleteContact(contactHandle, currentUser.sessionToken);

      // 3. Clean up local data
      // Close tab if it's open
      const tabIndex = activeTabs.findIndex(tab => tab.contactHandle === contactHandle);
      if (tabIndex > -1) {
        handleCloseTab(tabIndex);
      }

      // Remove from contacts and conversations lists
      setContacts(prev => prev.filter(c => c.handle !== contactHandle));
      setConversations(prev => prev.filter(c => c.contactHandle !== contactHandle));

      // 4. Clean up cryptographic and message data
      const conversationId = [currentUser.handle, contactHandle].sort((a, b) => a.localeCompare(b)).join('#');
      await messageStorage.deleteConversation(conversationId);
      sessionManager.removeSession(contactHandle);
      await PFSIntegration.removePFSData(contactHandle);

      console.log(`Successfully deleted contact ${contactHandle} and all related data.`);

    } catch (error) {
      console.error(`Failed to delete contact: ${error}`);
      // In a real app, you'd show an error toast to the user
      alert(`Error: Could not delete contact ${contactHandle}.`);
    }
  };

  const handleAddContact = async (contactHandle: string) => {
    // Prevent adding self
    if (contactHandle === currentUser.handle) {
      console.error("You can't add yourself as a contact.");
      return;
    }

    // Check if contact already exists
    if (contacts.some(c => c.handle === contactHandle)) {
      console.log('Contact already exists, selecting it.');
      handleContactSelect(contactHandle);
      return;
    }

    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (!sessionData) {
        console.error('No session found');
        return;
      }
      
      let session;
      try {
        session = JSON.parse(sessionData);
      } catch (error) {
        console.error('Failed to parse session data:', error);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          contactHandle
        })
      });

      if (response.ok) {
        const result = await response.json();
        // Ensure the contact object has the correct structure
        const newContact = {
          id: result.contact?.id || result.id || Date.now().toString(),
          handle: contactHandle,
          verified: result.contact?.verified || false
        };
        setContacts(prev => [...prev, newContact]);
        handleContactSelect(contactHandle);
        setShowAddContact(false);
        setNewContactHandle('');
      } else {
        const error = await response.json();
        console.error('Failed to add contact:', error);
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
      return 'now';
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h`;
    } else if (diffDays < 7) {
      return `${Math.floor(diffDays)}d`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact?.handle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show messaging component if there's an active tab
  if (activeTabIndex >= 0 && activeTabs[activeTabIndex]) {
    const activeTab = activeTabs[activeTabIndex];
    return (
      <div className="flex flex-col h-full bg-black">
        {/* iOS-style header */}
        <div className="relative flex items-center justify-center h-14 sm:h-16 bg-gray-900/95 backdrop-blur-xl border-b border-gray-700/50">
          {onBackHome && (
            <button
              onClick={onBackHome}
              className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-blue-400 text-base sm:text-lg font-medium focus:outline-none hover:opacity-70 transition-opacity"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
            >
              ← Back
            </button>
          )}
          <h1 
            className="text-lg font-semibold text-white"
            style={{ 
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              fontSize: 'clamp(16px, 4vw, 17px)',
              fontWeight: 600,
              letterSpacing: '-0.022em'
            }}
          >
            {activeTab.contactHandle}
          </h1>
        </div>

        {/* Messaging area */}
        <div className="flex-1">
          <MessagingComponent
            currentUser={currentUser}
            contactHandle={activeTab.contactHandle}
            onClose={onBackHome || (()=>{})}
            minimal
          />
        </div>
      </div>
    );
  }

  if (!connectionStatus.connected) {
    // You can render a banner or message here
    // e.g. <div className="p-2 text-center bg-red-500 text-white">Disconnected</div>
  }

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          {onBackHome && (
            <button
              onClick={onBackHome}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Home"
            >
              ←
            </button>
          )}
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {showNewChat ? 'New Chat' : 'Messages'}
          </h1>
        </div>
        <div className="flex space-x-2">
          {showNewChat ? (
            <button
              onClick={() => setShowNewChat(false)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              ✕
            </button>
          ) : (
            <button
              onClick={handleNewChat}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      {showNewChat && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Search contacts or enter handle (ABC-123)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400">Loading...</div>
          </div>
        ) : showNewChat ? (
          <div className="p-4">
            {/* Add by handle */}
            {searchQuery && !filteredContacts.some(c => c.handle === searchQuery.toUpperCase()) && (
              <div className="mb-4">
                <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Add new contact: {searchQuery.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Start a conversation with this handle
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddContact(searchQuery.toUpperCase())}
                      className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Existing contacts */}
            <div className="space-y-2">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => handleContactSelect(contact.handle)}
                  className="flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {contact.handle}
                      </span>
                      {contact.verified && (
                        <span className="text-green-500 text-sm">✓</span>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-400">→</div>
                </div>
              ))}
            </div>

            {filteredContacts.length === 0 && searchQuery && (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                No contacts found matching "{searchQuery}"
              </div>
            )}
          </div>
        ) : (
          // Conversation list
          <div>
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-6xl mb-4">💬</div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No conversations yet
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Start a new conversation by tapping the compose button
                </p>
                <button
                  onClick={handleNewChat}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.contactHandle}
                    onClick={() => handleContactSelect(conversation.contactHandle)}
                    className="flex items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {conversation.contactHandle}
                          </span>
                          {conversation.contact.verified && (
                            <span className="text-green-500 text-sm">✓</span>
                          )}
                        </div>
                        {conversation.lastMessage && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimestamp(conversation.lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      {conversation.lastMessage && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                          {conversation.lastMessage.isOwn ? 'You: ' : ''}
                          {conversation.lastMessage.content}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteContact(conversation.contactHandle);
                      }}
                      className="ml-4 p-2 text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface; 