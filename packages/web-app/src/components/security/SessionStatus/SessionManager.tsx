import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sendHeartbeat as apiSendHeartbeat, logout as apiLogout } from '../../../lib/api/sessionApi';

const API_BASE_URL = 'http://localhost:3001';

interface SessionState {
  sessionId: string;
  deviceId: string;
  userId: string;
  isActive: boolean;
  lastHeartbeat: number;
  sessionState: 'active' | 'corrupted' | 'repairing' | 'stale';
  createdAt: number;
  token?: string;
}

interface SessionManagerProps {
  currentUser: {
    handle: string;
    privateKey: string;
    publicKey: string;
  };
  onSessionInvalidated: () => void;
}

const SessionManager: React.FC<SessionManagerProps> = ({ currentUser, onSessionInvalidated }) => {
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const [sessionConflict, setSessionConflict] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Use refs to prevent dependency issues
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionCleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Constants
  const HEARTBEAT_INTERVAL = 60000; // 60 seconds
  const SESSION_TIMEOUT = 300000; // 5 minutes
  const CLEANUP_INTERVAL = 30000; // 30 seconds

  // Generate unique device ID
  const generateDeviceId = useCallback((): string => {
    const existing = localStorage.getItem('secmes_device_id');
    if (existing) return existing;

    const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('secmes_device_id', deviceId);
    return deviceId;
  }, []);

  // Check for existing sessions
  const checkExistingSession = useCallback(async (userId: string): Promise<SessionState | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me?handle=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        // User exists, check if we have a valid session
        const savedSession = localStorage.getItem('secmes_current_session');
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession);
            // Validate session structure
            if (parsed && typeof parsed === 'object' && parsed.sessionId && parsed.userId) {
              return parsed;
            } else {
              console.warn('Invalid session structure, clearing corrupted session data');
              localStorage.removeItem('secmes_current_session');
              return null;
            }
          } catch (error) {
            console.error('JSON parsing error for session data:', error);
            console.log('Corrupted session data:', savedSession);
            // Clear corrupted session data
            localStorage.removeItem('secmes_current_session');
            return null;
          }
        }
      }
      return null;
    } catch (error) {
      console.warn('Could not check existing sessions:', error);
      return null;
    }
  }, []);

  const invalidateSession = useCallback(() => {
    stopHeartbeat();
    localStorage.removeItem('secmes_current_session');
    localStorage.removeItem('secmes_offline_session');
    setSessionState(null);
    setSessionConflict(false);
    onSessionInvalidated();
  }, [onSessionInvalidated]);

  const sendHeartbeat = useCallback(async () => {
    const currentSession = JSON.parse(localStorage.getItem('secmes_current_session') || '{}');
    if (!currentSession.sessionId || !currentSession.token) return;

    try {
      await apiSendHeartbeat({
        sessionId: currentSession.sessionId,
        token: currentSession.token,
      });
      setConnectionStatus('connected');
      // Update local heartbeat time
      localStorage.setItem('secmes_current_session', JSON.stringify({ ...currentSession, lastHeartbeat: Date.now() }));

    } catch (error: any) {
      if (error.message.includes('404')) {
        invalidateSession();
      } else {
        setConnectionStatus('disconnected');
      }
    }
  }, [invalidateSession]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    sendHeartbeat();
  }, [sendHeartbeat]);

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // Session cleanup
  const cleanupStaleSessions = useCallback(() => {
    const now = Date.now();
    
    // Check local session timeout
    if (sessionState && (now - sessionState.lastHeartbeat) > SESSION_TIMEOUT) {
      console.log('Local session timed out');
      setSessionState(prev => prev ? { ...prev, sessionState: 'stale' } : null);
    }
  }, [sessionState]);

  // Force logout from another device
  const forceLogoutOtherDevice = useCallback(async () => {
    const currentSession = JSON.parse(localStorage.getItem('secmes_current_session') || '{}');
    if (!currentSession.token) return;
    try {
      await apiLogout({
        sessionId: currentSession.sessionId,
        token: currentSession.token,
      });
    } catch (error) {
      console.error('Force logout failed, proceeding locally:', error);
    } finally {
      invalidateSession();
    }
  }, [invalidateSession]);

  // Initialize session
  const initializeSession = useCallback(async () => {
    if (!currentUser) return;

    try {
      const deviceId = generateDeviceId();

      // Check for existing sessions first
      const existingSession = await checkExistingSession(currentUser.handle);
      if (existingSession && existingSession.isActive) {
        setSessionConflict(true);
        return;
      }

      // Create new session
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: currentUser.handle, deviceId: generateDeviceId() }),
      });

      if (response.ok) {
        const sessionData = await response.json();
        const newSession: SessionState = {
          sessionId: sessionData.sessionId,
          deviceId,
          userId: currentUser.handle,
          isActive: true,
          lastHeartbeat: Date.now(),
          sessionState: 'active',
          createdAt: Date.now(),
          token: sessionData.token,
        };

        setSessionState(newSession);
        setConnectionStatus('connected');
        localStorage.setItem('secmes_current_session', JSON.stringify(newSession));
        startHeartbeat();
      } else if (response.status === 409) {
        // Session conflict - another device is active
        setSessionConflict(true);
      } else {
        // Offline mode - create local session
        console.log('Session API unavailable, creating local session');
        const localSession: SessionState = {
          sessionId: 'local_session_' + Date.now(),
          deviceId,
          userId: currentUser.handle,
          isActive: true,
          lastHeartbeat: Date.now(),
          sessionState: 'active',
          createdAt: Date.now(),
        };

        setSessionState(localSession);
        setConnectionStatus('disconnected');
        localStorage.setItem('secmes_current_session', JSON.stringify(localSession));
        localStorage.setItem('secmes_offline_session', 'true');
        startHeartbeat(); // Still use heartbeat for local session management
      }
    } catch (error) {
      console.error('Session initialization failed:', error);
      setConnectionStatus('disconnected');
    }
  }, [currentUser, generateDeviceId, checkExistingSession, startHeartbeat]);

  // Initialize session on mount - only run once per user
  useEffect(() => {
    if (currentUser && !isInitialized) {
      setIsInitialized(true);
      
      // Check for existing session
      const savedSession = localStorage.getItem('secmes_current_session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          setSessionState(session);
          startHeartbeat();
        } catch (error) {
          console.error('Failed to restore session:', error);
          initializeSession();
        }
      } else {
        initializeSession();
      }
    }

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (sessionCleanupIntervalRef.current) {
        clearInterval(sessionCleanupIntervalRef.current);
      }
    };
  }, [currentUser?.handle]); // Only depend on handle to prevent loops

  // Start cleanup interval - separate effect
  useEffect(() => {
    sessionCleanupIntervalRef.current = setInterval(cleanupStaleSessions, CLEANUP_INTERVAL);

    return () => {
      if (sessionCleanupIntervalRef.current) {
        clearInterval(sessionCleanupIntervalRef.current);
      }
    };
  }, []); // Run once

  // Get connection status color
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'reconnecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Get session state color
  const getSessionStateColor = () => {
    switch (sessionState?.sessionState) {
      case 'active': return 'text-green-600';
      case 'repairing': return 'text-yellow-600';
      case 'corrupted': return 'text-red-600';
      case 'stale': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  // Format last heartbeat time
  const formatLastHeartbeat = () => {
    if (!sessionState) return 'Never';
    const diff = Date.now() - sessionState.lastHeartbeat;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Show session conflict dialog
  if (sessionConflict) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Device Conflict</h2>
            <p className="text-gray-600 mb-6">
              Your account is already active on another device. For security, only one device can be active at a time.
            </p>
            <div className="space-y-3">
              <button
                onClick={forceLogoutOtherDevice}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Log out other device and continue here
              </button>
              <button
                onClick={invalidateSession}
                className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel and log out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Session status indicator (always visible but minimized)
  return (
    <div className="fixed top-4 right-4 z-40">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-xs">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`}></div>
          <span className="text-gray-600">
            {connectionStatus === 'connected' ? 'Online' : 
             connectionStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
          </span>
        </div>
        {sessionState && (
          <div className="mt-1 space-y-1">
            <div className={`${getSessionStateColor()}`}>
              Session: {sessionState.sessionState}
            </div>
            <div className="text-gray-500">
              Last sync: {formatLastHeartbeat()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionManager; 