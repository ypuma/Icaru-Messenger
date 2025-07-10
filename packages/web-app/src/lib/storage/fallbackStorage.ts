import type { IdentityKeyPair } from '../crypto/simplifiedCrypto';

export interface StoredAccount {
  handle: string;
  identityKeyPair: {
    pubKey: string;
    privKey: string;
  };
  preKeyBundle: any;
  recoveryPhrase: string;
  createdAt: Date;
}


export class FallbackStorage {
  private encryptionKey: Uint8Array | null = null;

  constructor(private password: string) {}

  async initialize(): Promise<void> {
    try {
      // Derive a simple key from password
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(this.password);
      
      // Use a fixed salt for localStorage (not ideal but functional)
      const salt = new TextEncoder().encode('secmes_salt_v1');
      
      // Simple key derivation using available crypto
      if (crypto.subtle) {
        try {
          const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBytes,
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
          );
          
          const derivedKey = await crypto.subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: salt,
              iterations: 10000, // Reduced iterations for localStorage
              hash: 'SHA-256'
            },
            keyMaterial,
            256
          );
          
          this.encryptionKey = new Uint8Array(derivedKey);
        } catch (_cryptoError) {
          console.warn('Web Crypto API failed, using basic encoding');
          // Fallback to simple encoding (not secure, but functional)
          this.encryptionKey = passwordBytes.slice(0, 32);
        }
      } else {
        // No crypto available, use basic encoding
        this.encryptionKey = passwordBytes.slice(0, 32);
      }
      
      console.log('Fallback storage initialized');
    } catch (error) {
      console.error('Failed to initialize fallback storage:', error);
      throw new Error('Fallback storage initialization failed');
    }
  }

  async storeAccount(account: StoredAccount): Promise<void> {
    try {
      if (!this.encryptionKey) {
        throw new Error('Storage not initialized');
      }

      const accountData = JSON.stringify({
        ...account,
        createdAt: account.createdAt.toISOString()
      });

      // Simple encoding (not secure encryption, but obfuscated)
      const encoded = await this.encodeData(accountData);
      
      localStorage.setItem(`secmes_account_${account.handle}`, encoded);
      localStorage.setItem('secmes_has_account', 'true');
      localStorage.setItem('secmes_current_handle', account.handle);
      
      console.log('Account stored in localStorage');
    } catch (error) {
      console.error('Failed to store account in localStorage:', error);
      throw new Error('Failed to store account data');
    }
  }

  async getAccount(handle: string): Promise<StoredAccount | null> {
    try {
      if (!this.encryptionKey) {
        throw new Error('Storage not initialized');
      }

      const encoded = localStorage.getItem(`secmes_account_${handle}`);
      if (!encoded) {
        return null;
      }

      const decoded = await this.decodeData(encoded);
      const parsed = JSON.parse(decoded);
      
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt)
      };
    } catch (error) {
      console.error('Failed to retrieve account from localStorage:', error);
      return null;
    }
  }

  async deleteAccount(handle: string): Promise<void> {
    localStorage.removeItem(`secmes_account_${handle}`);
    
    // If this was the current account, clear flags
    if (localStorage.getItem('secmes_current_handle') === handle) {
      localStorage.removeItem('secmes_has_account');
      localStorage.removeItem('secmes_current_handle');
    }
    
    console.log('Account deleted from localStorage');
  }

  async listAccounts(): Promise<string[]> {
    const handles: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('secmes_account_')) {
        const handle = key.replace('secmes_account_', '');
        handles.push(handle);
      }
    }
    
    return handles;
  }

  async hasAccount(handle: string): Promise<boolean> {
    return localStorage.getItem(`secmes_account_${handle}`) !== null;
  }

  async clearAll(): Promise<void> {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('secmes_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('All fallback storage cleared');
  }

  close(): void {
    this.encryptionKey = null;
  }

  private async encodeData(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    try {
      if (crypto.subtle) {
        // Use actual encryption if available
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(data);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          this.encryptionKey,
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        );
        
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: iv },
          cryptoKey,
          dataBytes
        );
        
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        return btoa(String.fromCharCode(...combined));
      } else {
        // Fallback to simple Base64 encoding
        return btoa(data);
      }
    } catch (error) {
      console.warn('Encryption failed, using Base64:', error);
      return btoa(data);
    }
  }

  private async decodeData(encoded: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    try {
      if (crypto.subtle) {
        // Try decryption first
        const combined = new Uint8Array(
          atob(encoded).split('').map(char => char.charCodeAt(0))
        );
        
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          this.encryptionKey,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          cryptoKey,
          encrypted
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
      } else {
        // Fallback to Base64 decoding
        return atob(encoded);
      }
    } catch (_cryptoError) {
      // If decryption fails, it could be due to old data or corruption.
  
      try {
        return atob(encoded);
      } catch (error) {
        console.warn('Decryption failed, trying Base64:', error);
        return atob(encoded);
      }
    }
  }
} 