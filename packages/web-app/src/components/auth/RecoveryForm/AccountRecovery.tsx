import React, { useState, useCallback, useEffect } from 'react';
import * as bip39 from 'bip39';
import { deriveKeyPairFromMnemonic } from '../../../lib/crypto/account';
import { Buffer } from 'buffer';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';

interface RecoveryAttempt {
  timestamp: number;
  ipAddress?: string;
  success: boolean;
}

interface AccountRecoveryProps {
  onAccountRecovered: (userData: {
    handle: string;
    privateKey: string;
    publicKey: string;
  }) => void;
  onCancel: () => void;
  onSwitchToRegister: () => void;
}

const AccountRecovery: React.FC<AccountRecoveryProps> = ({ onAccountRecovered, onCancel }) => {
  const [recoveryWords, setRecoveryWords] = useState<string[]>(Array(12).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [recoveryAttempts, setRecoveryAttempts] = useState<RecoveryAttempt[]>([]);
  const [rateLimited, setRateLimited] = useState(false);

  // Constants
  const MAX_ATTEMPTS_PER_HOUR = 3;
  const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds

  // On mount, query the server for current rate-limit status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/recovery/rate-limit`);
        if (res.ok) {
          const data: { allowed: boolean; retryAfter: number } = await res.json();
          if (!data.allowed) {
            setRateLimited(true);
            setError(`Zu viele Wiederherstellungsversuche. Versuchen Sie es in ${Math.ceil(data.retryAfter / 60)} Minuten erneut.`);
          }
        }
      } catch {
        console.warn('Wiederherstellungsversuche-Limit-Check fehlgeschlagen, Fallback auf Client-Logik');
      }
    })();
  }, []);

  // Load recovery attempts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('secmes_recovery_attempts');
    if (stored) {
      try {
        const attempts = JSON.parse(stored);
        setRecoveryAttempts(attempts);
        checkRateLimit(attempts);
      } catch (error) {
        console.error('Failed to parse recovery attempts:', error);
      }
    }
  }, []);

  // Check if user is rate limited
  const checkRateLimit = useCallback((attempts: RecoveryAttempt[]) => {
    const now = Date.now();
    const recentAttempts = attempts.filter(
      attempt => now - attempt.timestamp < RATE_LIMIT_WINDOW
    );
    
    if (recentAttempts.length >= MAX_ATTEMPTS_PER_HOUR) {
      const oldestAttempt = Math.min(...recentAttempts.map(a => a.timestamp));
      const timeUntilReset = oldestAttempt + RATE_LIMIT_WINDOW - now;
      setRateLimited(true);
      setError(`Zu viele Wiederherstellungsversuche. Versuchen Sie es in ${Math.ceil(timeUntilReset / 60000)} Minuten erneut.`);
      
      // Set timer to clear rate limit
      setTimeout(() => {
        setRateLimited(false);
        setError('');
      }, timeUntilReset);
    } else {
      setRateLimited(false);
    }
  }, []);

  // Record recovery attempt
  const recordRecoveryAttempt = useCallback((success: boolean) => {
    const attempt: RecoveryAttempt = {
      timestamp: Date.now(),
      success
    };
    
    const updatedAttempts = [...recoveryAttempts, attempt];
    setRecoveryAttempts(updatedAttempts);
    localStorage.setItem('secmes_recovery_attempts', JSON.stringify(updatedAttempts));
    
    if (!success) {
      checkRateLimit(updatedAttempts);
    }
  }, [recoveryAttempts, checkRateLimit]);

  // Validate recovery seed
  const validateRecoveryWords = useCallback((): boolean => {
    const mnemonic = recoveryWords.join(' ').trim();
    
    if (!mnemonic || recoveryWords.some(word => !word.trim())) {
      setError('Geben sie bitte alle 12 Wörter ein.');
      return false;
    }

    if (!bip39.validateMnemonic(mnemonic)) {
      setError('Ungültige Wiederherstellungsphrase. Bitte überprüfen Sie Ihre Wörter und versuchen Sie es erneut.');
      return false;
    }

    return true;
  }, [recoveryWords]);

  // Process recovery seed
  const handleSeedRecovery = useCallback(async () => {
    // Check server rate-limit again just before attempting
    try {
              const res = await fetch(`${API_BASE_URL}/api/recovery/rate-limit`);
      if (res.ok) {
        const data: { allowed: boolean; retryAfter: number } = await res.json();
        if (!data.allowed) {
          setRateLimited(true);
          setError(`Zu viele Wiederherstellungsversuche. Versuchen Sie es in ${Math.ceil(data.retryAfter / 60)} Minuten erneut.`);
          return;
        }
      }
    } catch {
      console.warn('Rate-limit check failed, proceeding with attempt');
    }

    if (rateLimited) return;
    
    if (!validateRecoveryWords()) {
      recordRecoveryAttempt(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const mnemonic = recoveryWords.join(' ').trim();

      // Derive key pair from mnemonic
      const keyPair = await deriveKeyPairFromMnemonic(mnemonic);
      
      if (!keyPair) {
         throw new Error('Failed to derive keys from recovery seed.');
      }
      
      // Convert hex public key to base64 for backend lookup
      const publicKeyBase64 = Buffer.from(keyPair.pubKey, 'hex').toString('base64');

      console.log('Recovery Debug Info:');
      console.log('- Mnemonic:', mnemonic);
      console.log('- Derived public key (hex):', keyPair.pubKey);
      console.log('- Derived public key (base64):', publicKeyBase64);
      console.log('- Looking up account with this public key...');

      // Look up account by public key instead of derived handle
      const response = await fetch(`${API_BASE_URL}/api/auth/lookup-by-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: publicKeyBase64 })
      });

      console.log('Backend response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log('Backend error response:', errorData);
        if (response.status === 404) {
          throw new Error('Konto nicht gefunden. Diese Wiederherstellungsphrase könnte von einer anderen Installation stammen oder das Konto wurde gelöscht.');
        }
        throw new Error(errorData.error || 'Failed to verify account');
      }

      const data = await response.json();
      if (!data.success || !data.account) {
        throw new Error('Invalid response from server during account lookup.');
      }

      recordRecoveryAttempt(true);
      
      // Pass recovered data to parent component using the actual handle from database
      onAccountRecovered({
        handle: data.account.handle,
        privateKey: keyPair.privKey,
        publicKey: keyPair.pubKey,
      });

    } catch (error) {
      console.error('Account recovery failed:', error);
      setError(error instanceof Error ? error.message : 'Ein unerwarteter Fehler ist während der Wiederherstellung aufgetreten.');
      recordRecoveryAttempt(false);
    } finally {
      setIsLoading(false);
    }
  }, [recoveryWords, rateLimited, validateRecoveryWords, recordRecoveryAttempt, onAccountRecovered]);

  // Handle word input changes with auto-completion
  const handleWordChange = (index: number, value: string) => {
    const newWords = [...recoveryWords];
    newWords[index] = value.toLowerCase().trim();
    setRecoveryWords(newWords);
    setError('');
  };

  // Get word suggestions for auto-completion
  const getWordSuggestions = (input: string): string[] => {
    if (!input || input.length < 2) return [];
    
    const wordlist = bip39.wordlists.english;
    return wordlist
      .filter(word => word.startsWith(input.toLowerCase()))
      .slice(0, 5);
  };

  // Render recovery seed form
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Wiederherstellen Sie Ihr Konto</h2>
        <p className="text-gray-600">Geben Sie Ihre 12-Wort-Wiederherstellungsphrase ein</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {recoveryWords.map((word, index) => (
          <div key={index} className="relative">
            <label className="block text-xs text-gray-500 mb-1">
              {index + 1}
            </label>
            <input
              type="text"
              value={word}
              onChange={(e) => handleWordChange(index, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={`Word ${index + 1}`}
              disabled={isLoading || rateLimited}
              autoComplete="off"
              list={`suggestions-${index}`}
            />
            <datalist id={`suggestions-${index}`}>
              {getWordSuggestions(word).map((suggestion, i) => (
                <option key={i} value={suggestion} />
              ))}
            </datalist>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="flex space-x-4">
        <button
          onClick={onCancel}
          className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          disabled={isLoading}
        >
          Back to Login
        </button>
        <button
          onClick={handleSeedRecovery}
          disabled={isLoading || rateLimited}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Recovering...' : 'Recover Account'}
        </button>
      </div>
    </div>
  );
};

export default AccountRecovery;