export interface WebSocketMessage {
  type: 'message' | 'typing' | 'heartbeat' | 'auth' | 'auth_success' | 'auth_error' | 'message_sent' | 'error' | 'heartbeat_ack' | 'delivery_receipt';
  data: any;
  timestamp: number;
}

export interface MessageData {
  id: string;
  content: string;
  messageType: string;
  senderHandle: string;
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  authenticated: boolean;
  reconnecting: boolean;
}

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = (status: ConnectionStatus) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = {
    connected: false,
    authenticated: false,
    reconnecting: false
  };
  
  private messageHandlers = new Map<string, MessageHandler[]>();
  private connectionHandlers: ConnectionHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  private sessionToken: string | null = null;
  private sessionId: string | null = null;

  constructor() {
    this.setupEventHandlers();
  }

  async connect(token: string, sessionId: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.sessionToken = token;
    this.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `ws://localhost:3001/ws`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.connectionStatus.connected = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionHandlers();
          
          // Send authentication
          this.send({
            type: 'auth',
            data: { token, sessionId },
            timestamp: Date.now()
          });
        };

        this.ws.onmessage = (event) => {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
          
          if (message.type === 'auth_success') {
            this.connectionStatus.authenticated = true;
            this.notifyConnectionHandlers();
            this.startHeartbeat();
            resolve();
          } else if (message.type === 'auth_error') {
            reject(new Error('Authentication failed'));
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.connectionStatus.connected = false;
          this.connectionStatus.authenticated = false;
          this.notifyConnectionHandlers();
          this.stopHeartbeat();
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopHeartbeat();
    this.connectionStatus = {
      connected: false,
      authenticated: false,
      reconnecting: false
    };
    this.notifyConnectionHandlers();
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  sendMessage(receiverHandle: string, content: string, messageType: string = 'text', tempId?: string) {
    this.send({
      type: 'message',
      data: {
        receiverHandle,
        content,
        messageType,
        tempId
      },
      timestamp: Date.now()
    });
  }

  sendTypingIndicator(receiverHandle: string, isTyping: boolean) {
    this.send({
      type: 'typing',
      data: {
        receiverHandle,
        isTyping
      },
      timestamp: Date.now()
    });
  }

  onMessage(type: string, handler: MessageHandler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  offMessage(type: string, handler: MessageHandler) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.push(handler);
  }

  offConnectionChange(handler: ConnectionHandler) {
    const index = this.connectionHandlers.indexOf(handler);
    if (index > -1) {
      this.connectionHandlers.splice(index, 1);
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  private setupEventHandlers() {
    // Handle page visibility changes for reconnection
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.connectionStatus.connected && this.sessionToken && this.sessionId) {
        this.connect(this.sessionToken, this.sessionId);
      }
    });

    // Handle online/offline events
    window.addEventListener('online', () => {
      if (!this.connectionStatus.connected && this.sessionToken && this.sessionId) {
        this.connect(this.sessionToken, this.sessionId);
      }
    });

    window.addEventListener('offline', () => {
      if (this.connectionStatus.connected) {
        this.connectionStatus.connected = false;
        this.connectionStatus.authenticated = false;
        this.notifyConnectionHandlers();
      }
    });
  }

  private handleMessage(message: WebSocketMessage) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }

    // Handle built-in message types
    switch (message.type) {
      case 'heartbeat_ack':
        // Heartbeat acknowledged, connection is alive
        break;
      
      case 'error':
        console.error('WebSocket error:', message.data.message);
        break;
    }
  }

  private notifyConnectionHandlers() {
    this.connectionHandlers.forEach(handler => handler(this.connectionStatus));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'heartbeat',
        data: {},
        timestamp: Date.now()
      });
    }, 30000); // Send heartbeat every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.sessionToken || !this.sessionId) {
      return;
    }

    this.connectionStatus.reconnecting = true;
    this.notifyConnectionHandlers();

    setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      this.connect(this.sessionToken!, this.sessionId!)
        .then(() => {
          this.connectionStatus.reconnecting = false;
          this.notifyConnectionHandlers();
        })
        .catch(() => {
          this.connectionStatus.reconnecting = false;
          this.notifyConnectionHandlers();
          this.attemptReconnect();
        });
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts)); // Exponential backoff
  }
}

// Export singleton instance
export const webSocketClient = new WebSocketClient(); 