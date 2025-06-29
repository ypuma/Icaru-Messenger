// Error Types
export class SecureMessengerError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'SecureMessengerError';
    }
}
export class CryptoError extends SecureMessengerError {
    constructor(message, details) {
        super(message, 'CRYPTO_ERROR', details);
        this.name = 'CryptoError';
    }
}
export class StorageError extends SecureMessengerError {
    constructor(message, details) {
        super(message, 'STORAGE_ERROR', details);
        this.name = 'StorageError';
    }
}
export class NetworkError extends SecureMessengerError {
    constructor(message, details) {
        super(message, 'NETWORK_ERROR', details);
        this.name = 'NetworkError';
    }
}
export class SessionError extends SecureMessengerError {
    constructor(message, details) {
        super(message, 'SESSION_ERROR', details);
        this.name = 'SessionError';
    }
}
