const BASE_URL = import.meta.env.VITE_API_URL || 'http://0.0.0.0:11401';

export interface HeartbeatRequest {
  sessionId: string;
  token: string;
}

export interface HeartbeatResponse {
  status: string;
  lastHeartbeat: string;
  message: string;
}

export interface SessionRequest {
  handle: string;
  signature: string;
}

export interface SessionResponse {
  sessionId: string;
  token: string;
  expiresAt: string;
}

/**
 * Create a new session for the user
 */
export const createSession = async (data: SessionRequest): Promise<SessionResponse> => {
  console.log('Creating session with data:', data);
  
  const response = await fetch(`${BASE_URL}/api/auth/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  console.log('Session API response status:', response.status);

  if (!response.ok) {
    let errorMessage = 'Failed to create session';
    try {
      const error = await response.json();
      console.log('Session API error response:', error);
      errorMessage = error.message || error.error || `HTTP ${response.status}: ${response.statusText}`;
    } catch (parseError) {
      console.error('Failed to parse error response:', parseError);
      const errorText = await response.text();
      console.log('Raw error response:', errorText);
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

/**
 * Send heartbeat to keep session alive
 */
export const sendHeartbeat = async (data: HeartbeatRequest): Promise<HeartbeatResponse> => {
  const response = await fetch(`${BASE_URL}/api/auth/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send heartbeat');
  }

  return response.json();
};

/**
 * Logout and invalidate session
 */
export const logout = async (data: HeartbeatRequest): Promise<void> => {
  const response = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to logout');
  }
}; 