import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SessionManager from './components/security/SessionStatus/SessionManager';
import MessagingComponent from './components/chat/MessageBubble/MessagingComponent';
import HomeScreen from './components/home/HomeScreen';
import { getOrCreateDeviceId } from './lib/utils/handle';
import { webSocketClient } from './lib/websocket/websocketClient';
import WelcomeScreen from './components/auth/RegisterForm/WelcomeScreen';
import { addContact as addContactApi } from './lib/api/contactApi';
import { globalMessageService } from './lib/services/GlobalMessageService';
import { clearAllCacheOnLogout } from './lib/utils/cacheManager';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';
import './styles/App.css';

interface User {
  handle: string;
  publicKey: string;
  privateKey: string;
  sessionToken: string;
  sessionId: string;
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'home' | 'chat'>('home');
  const [selectedContactHandle, setSelectedContactHandle] = useState<string | null>(null);
  const [selectedContactDisplayName, setSelectedContactDisplayName] = useState<string | null>(null);
  const [initialShowNewChat, setInitialShowNewChat] = useState(false);

  useEffect(() => {
    // Check for existing session on app start
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const storedUser = localStorage.getItem('secmes_current_user');
      const storedSession = localStorage.getItem('secmes_current_session');
      
      if (storedUser && storedSession) {
        let userData, sessionData;
        
        try {
          userData = JSON.parse(storedUser);
        } catch (error) {
          console.error('JSON parsing error for user data:', error);
          console.log('Corrupted user data:', storedUser);
          localStorage.removeItem('secmes_current_user');
          return;
        }
        
        try {
          sessionData = JSON.parse(storedSession);
        } catch (error) {
          console.error('JSON parsing error for session data:', error);
          console.log('Corrupted session data:', storedSession);
          localStorage.removeItem('secmes_current_session');
          return;
        }
        
        // Validate session with server
        const response = await fetch(`${API_BASE_URL}/api/auth/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionData.sessionId,
            token: sessionData.token
          })
        });

        if (response.ok) {
          console.log('Session validation successful');
          const user: User = {
            ...userData,
            sessionToken: sessionData.token,
            sessionId: sessionData.sessionId
          };
          setCurrentUser(user);

          // Re-establish WebSocket connection
          await webSocketClient.connect(sessionData.token, sessionData.sessionId);

          // Initialize global message service
          try {
            await globalMessageService.initialize(user);
            console.log(' GlobalMessageService initialized for existing session');
          } catch (error) {
            console.error('Failed to initialize GlobalMessageService:', error);
          }
        } else {
          // Clear invalid session
          localStorage.removeItem('secmes_current_user');
          localStorage.removeItem('secmes_current_session');
        }
      }
    } catch (error) {
      console.error('Failed to validate existing session:', error);
      // Clear potentially corrupted data
      localStorage.removeItem('secmes_current_user');
      localStorage.removeItem('secmes_current_session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccountCreated = (userData: {
    handle: string;
    publicKey: string;
    privateKey: string;
  }) => {
    // Account created, so now we create a session
    createSession(userData);
  };

  const createSession = async (userData: {
    handle: string;
    publicKey: string;
    privateKey: string;
  }) => {
    try {
      const deviceId = getOrCreateDeviceId();
      
      // 2. Request a session from the backend
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: userData.handle, deviceId })
      });

      if (!response.ok) {
        throw new Error('Session creation failed');
      }

      const sessionData = await response.json();

      // Connect to WebSocket after session is established
      await webSocketClient.connect(sessionData.token, sessionData.sessionId);

      const user: User = {
        handle: userData.handle,
        publicKey: userData.publicKey,
        privateKey: userData.privateKey,
        sessionToken: sessionData.token,
        sessionId: sessionData.sessionId
      };

      setCurrentUser(user);
      
      // Initialize global message service
      try {
        await globalMessageService.initialize(user);
        console.log('GlobalMessageService initialized for new session');
      } catch (error) {
        console.error('Failed to initialize GlobalMessageService:', error);
      }
      
      // Store user data and session
      localStorage.setItem('secmes_current_user', JSON.stringify({
        handle: userData.handle,
        publicKey: userData.publicKey,
        privateKey: userData.privateKey
      }));
      
      localStorage.setItem('secmes_current_session', JSON.stringify({
        sessionId: sessionData.sessionId,
        token: sessionData.token,
        deviceId,
        userId: userData.handle,
        isActive: true,
        lastHeartbeat: Date.now(),
        sessionState: 'active',
        createdAt: Date.now()
      }));
      
    } catch (err) {
      console.error('Session creation failed:', err);
      alert('Failed to create session. Please try again.');
    }
  };

  const handleSessionInvalidated = async () => {
          console.log('Session invalidated - performing cleanup...');
    
    try {
      // Use the comprehensive cache clearing for session invalidation too
      globalMessageService.cleanup();
      await clearAllCacheOnLogout();
      setCurrentUser(null);
              console.log('Session invalidation cleanup completed');
    } catch (error) {
              console.error('Session invalidation cleanup failed:', error);
      // Fallback cleanup
      setCurrentUser(null);
      localStorage.clear();
      sessionStorage.clear();
    }
  };

  const handleLogout = async () => {
    console.log('Initiating logout process...');
    
    try {
      // 1. First, attempt to logout from server
      if (currentUser) {
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionId: currentUser.sessionId,
              token: currentUser.sessionToken
            })
          });
          console.log('Server logout request completed');
        } catch (error) {
          console.error('Logout request failed (proceeding with local cleanup):', error);
        }
      }
      
      // 2. Cleanup global message service
      globalMessageService.cleanup();
              console.log('Global message service cleaned up');
      
      // 3. Clear WebSocket connection
      try {
        webSocketClient.disconnect();
                  console.log('WebSocket disconnected');
      } catch (error) {
                  console.warn('WebSocket disconnect failed:', error);
      }
      
      // 4. Comprehensive cache clearing
      await clearAllCacheOnLogout();
      
      // 5. Reset application state
      setCurrentUser(null);
      setView('home');
      setSelectedContactHandle(null);
      setSelectedContactDisplayName(null);
      setInitialShowNewChat(false);
      
      console.log('Logout process completed successfully');
      
    } catch (error) {
      console.error('Error during logout process:', error);
      
      // Fallback: force reset application state even if cache clearing failed
      try {
        setCurrentUser(null);
        setView('home');
        setSelectedContactHandle(null);
        setSelectedContactDisplayName(null);
        setInitialShowNewChat(false);
        
        // Basic cache clearing fallback
        localStorage.clear();
        sessionStorage.clear();
        
        console.log('Logout completed with fallback cleanup');
      } catch (fallbackError) {
        console.error('Even fallback cleanup failed:', fallbackError);
        // Force page reload as last resort
        window.location.reload();
      }
    }
  };

  // Handle navigation between Home and Chat
  const handleSelectContact = async (contactHandle: string) => {
    setSelectedContactHandle(contactHandle);
    setInitialShowNewChat(false);
    
    // Fetch contact info to get nickname
    try {
      const sessionData = localStorage.getItem('secmes_current_session');
      if (sessionData) {
        const { token } = JSON.parse(sessionData);
        const response = await fetch(`${API_BASE_URL}/api/contacts`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          const contact = data.contacts.find((c: any) => c.handle === contactHandle);
          setSelectedContactDisplayName(contact?.nickname || contactHandle);
        } else {
          setSelectedContactDisplayName(contactHandle);
        }
      } else {
        setSelectedContactDisplayName(contactHandle);
      }
    } catch (err) {
      console.error('Failed to fetch contact info:', err);
      setSelectedContactDisplayName(contactHandle);
    }
    
    setView('chat');
  };

  const handleShowContacts = () => {
    setInitialShowNewChat(true);
    setView('chat');
  };

  const handleAddContact = async (contactHandle: string, nickname?: string) => {
    if (!currentUser) return;

    try {
      await addContactApi(contactHandle, currentUser.sessionToken, nickname);

      // Remain on the Home view; contacts list will refresh
      // Optionally, reset any chat-related state
      setInitialShowNewChat(false);
    } catch (err) {
      console.error('Failed to add contact:', err);
      // Re-throw the error so HomeScreen can handle it
      throw err;
    }
  };

  const handleBackHome = () => {
    setSelectedContactHandle(null);
    setSelectedContactDisplayName(null);
    setView('home');
  };

  // Whenever currentUser changes to non-null, reset view to home
  useEffect(() => {
    if (currentUser) {
      setView('home');
    }
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!currentUser ? (
        <motion.div
          key="auth"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="w-full h-screen bg-black flex items-center justify-center overflow-hidden"
        >
          <WelcomeScreen onAccountCreated={handleAccountCreated} />
        </motion.div>
      ) : (
        view === 'home' ? (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="w-full h-screen bg-black overflow-hidden"
          >
            <HomeScreen
              handle={currentUser.handle}
              onContactSelect={handleSelectContact}
              onAddContact={handleAddContact}
              onLogout={handleLogout}
            />
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="w-full h-screen bg-black overflow-hidden"
          >
            {/* Fixed Contact Name */}
            <div style={{ 
              position: 'fixed', 
              top: '1rem', 
              left: '50%', 
              transform: 'translateX(-50%)', 
              zIndex: 1000,
              color: '#ffffff',
              fontSize: '1.5rem', 
              fontFamily: 'SF Pro Rounded, SF Pro, -apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: 600, 
              letterSpacing: '0.02em', 
              textAlign: 'center',
              padding: '0.5rem 1rem',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 255, 255, 0.15)'
            }}>
              {selectedContactDisplayName || 'Chat'}
            </div>

            {/* Messages Component - Full Screen */}
            {selectedContactHandle && (
              <MessagingComponent
                currentUser={currentUser}
                contactHandle={selectedContactHandle}
                onClose={handleBackHome}
                minimal={true}
              />
            )}
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
}

export default App;
