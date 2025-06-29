// Core Types
export interface IdentityKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface PreKeyBundle {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  preKey?: {
    keyId: number;
    publicKey: string;
  };
}

export interface SignalMessage {
  type: number;
  body: Uint8Array | string;
  registrationId?: number;
  messageNumber?: number;
  previousChainLength?: number;
}

export interface UserAccount {
  handle: string;
  publicKey: string;
  privateKey?: string;
  accountId?: string;
  displayName?: string;
  registrationId?: number;
}

export interface Contact {
  handle: string;
  publicKey: string;
  displayName?: string;
  verified: boolean;
  verificationDate?: Date;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  encrypted: boolean;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  isActive: boolean;
  lastHeartbeat: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface RecoveryData {
  seed: string[];
  encryptedBackup?: string;
  version: number;
  timestamp: Date;
}

// Platform Abstraction Interfaces

export interface RatchetState {
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;
  skippedKeys: Map<number, Uint8Array>;
}

export interface EphemeralKeys {
  messageKey: Uint8Array;
  nextChainKey: Uint8Array;
}

export interface ICryptoProvider {
  // Identity Management
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  generateKeyPairFromSeed(seed: Uint8Array): Promise<IdentityKeyPair>;
  
  // Signal Protocol Operations
  generatePreKeyBundle(identityKeyPair: IdentityKeyPair): Promise<PreKeyBundle>;
  createSession(recipientBundle: PreKeyBundle, identityKeyPair: IdentityKeyPair): Promise<void>;
  encryptMessage(content: string, recipientHandle: string): Promise<SignalMessage>;
  decryptMessage(message: SignalMessage, senderHandle: string): Promise<string>;
  
  // Perfect Forward Secrecy Operations
  initializeRatchet(sessionKey: Uint8Array): Promise<RatchetState>;
  deriveMessageKeys(chainKey: Uint8Array): Promise<EphemeralKeys>;
  advanceChain(ratchetState: RatchetState): Promise<RatchetState>;
  rotateKeys(ratchetState: RatchetState, interval?: number): Promise<RatchetState>;
  
  // Utility Functions
  validatePublicKey(publicKey: string): boolean;
  generateSecureRandom(length: number): Uint8Array;
  generateHandle(): string;
  
  // Memory Management
  zeroizeMemory?(data: unknown): void;
}

export interface IStorageProvider {
  // Identity Storage
  storeIdentityKeyPair(keyPair: IdentityKeyPair): Promise<void>;
  getIdentityKeyPair(): Promise<IdentityKeyPair | null>;
  
  // Session Storage
  storeSession(address: string, sessionData: string): Promise<void>;
  getSession(address: string): Promise<string | null>;
  removeSession(address: string): Promise<void>;
  
  // Perfect Forward Secrecy Storage
  storeRatchetState(address: string, ratchetState: RatchetState): Promise<void>;
  getRatchetState(address: string): Promise<RatchetState | null>;
  removeRatchetState(address: string): Promise<void>;
  
  // Contact Storage
  storeContact(contact: Contact): Promise<void>;
  getContact(handle: string): Promise<Contact | null>;
  getAllContacts(): Promise<Contact[]>;
  removeContact(handle: string): Promise<void>;
  
  // Message Storage
  storeMessage(message: Message): Promise<void>;
  getMessages(contactHandle: string, limit?: number, offset?: number): Promise<Message[]>;
  removeMessage(messageId: string): Promise<void>;
  
  // User Account Storage
  storeUserAccount(account: UserAccount): Promise<void>;
  getUserAccount(): Promise<UserAccount | null>;
  
  // Recovery Storage
  storeRecoveryData(data: RecoveryData): Promise<void>;
  getRecoveryData(): Promise<RecoveryData | null>;
  
  // General Storage
  setItem(key: string, value: unknown): Promise<void>;
  getItem(key: string): Promise<unknown | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  
  // Security Operations
  emergencyWipe(): Promise<void>;
}

export interface IApiProvider {
  // Authentication
  register(handle: string, publicKey: string, deviceId: string): Promise<UserAccount>;
  createSession(handle: string, deviceId: string): Promise<Session>;
  sendHeartbeat(sessionId: string, token: string): Promise<void>;
  logout(sessionId: string, token: string): Promise<void>;
  
  // User Management
  getCurrentUser(handle: string): Promise<UserAccount | null>;
  updateUser(handle: string, data: Partial<UserAccount>): Promise<UserAccount>;
  
  // Contact Discovery
  findUserByHandle(handle: string): Promise<UserAccount | null>;
  getPreKeyBundle(handle: string): Promise<PreKeyBundle | null>;
  
  // Messaging
  sendMessage(recipientHandle: string, encryptedMessage: SignalMessage): Promise<void>;
  getMessages(limit?: number, offset?: number): Promise<Message[]>;
  
  // WebSocket/Real-time
  connectWebSocket(token: string): Promise<WebSocket>;
  onMessage(callback: (message: Message) => void): void;
  onTyping(callback: (handle: string, isTyping: boolean) => void): void;
  
  // Recovery
  recoverAccount(seed: string[] | string): Promise<UserAccount>;
}

// Platform Detection
export type Platform = 'web' | 'electron' | 'mobile';

export interface PlatformInfo {
  platform: Platform;
  version: string;
  capabilities: {
    biometric: boolean;
    secureStorage: boolean;
    memoryZeroization: boolean;
    pushNotifications: boolean;
  };
}

// Configuration
export interface AppConfig {
  apiUrl: string;
  wsUrl: string;
  enableLogging: boolean;
  platform: PlatformInfo;
  storage: {
    encrypted: boolean;
    provider: 'localStorage' | 'indexedDB' | 'sqlite' | 'secure';
  };
  crypto: {
    provider: 'browser' | 'native';
    enableMemoryZeroization: boolean;
  };
}

// Events
export interface AppEvent {
  type: string;
  payload: unknown;
  timestamp: Date;
}

export interface IEventBus {
  emit(event: AppEvent): void;
  on(eventType: string, handler: (event: AppEvent) => void): void;
  off(eventType: string, handler: (event: AppEvent) => void): void;
}

// Error Types
export class SecureMessengerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SecureMessengerError';
  }
}

export class CryptoError extends SecureMessengerError {
  constructor(message: string, details?: unknown) {
    super(message, 'CRYPTO_ERROR', details);
    this.name = 'CryptoError';
  }
}

export class StorageError extends SecureMessengerError {
  constructor(message: string, details?: unknown) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class NetworkError extends SecureMessengerError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class SessionError extends SecureMessengerError {
  constructor(message: string, details?: unknown) {
    super(message, 'SESSION_ERROR', details);
    this.name = 'SessionError';
  }
} 