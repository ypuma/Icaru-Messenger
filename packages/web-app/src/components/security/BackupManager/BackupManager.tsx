import React, { useState, useCallback, useEffect } from 'react';
import _sodium from 'libsodium-wrappers';
const sodium = _sodium;
import { formatHandle } from '../../../lib/utils/handle';
import { userApi } from '../../../lib/api/userApi';

interface BackupManagerProps {
  currentUser: {
    handle: string;
    privateKey: string;
    publicKey: string;
  };
  onClose: () => void;
}

interface BackupData {
  version: number;
  timestamp: number;
  handle: string;
  privateKey: string;
  publicKey: string;
  recoveryWords?: string[];
  contacts?: any[];
  settings?: any;
  backupNotes?: string;
}

const BackupManager: React.FC<BackupManagerProps> = ({ currentUser, onClose }) => {
  const [passphrase, setPassphrase] = useState<string>('');
  const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');
  const [backupNotes, setBackupNotes] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [lastBackupDate, setLastBackupDate] = useState<string>('');

  // Initialize sodium
  useEffect(() => {
    sodium.ready.then(() => {
      console.log('Sodium cryptography library ready for backup operations');
    });
  }, []);

  // Load last backup date
  useEffect(() => {
    (async () => {
      try {
        const profile = await userApi.getUserProfile(currentUser.handle);
        if (profile?.lastBackupDate) {
          const date = new Date(profile.lastBackupDate);
          setLastBackupDate(date.toLocaleDateString());
        }
      } catch (error) {
        console.error('Failed to load backup date:', error);
      }
    })();
  }, []);

  // Generate backup reminder notification
  const checkBackupReminder = useCallback(() => {
    // Backup reminder logic now handled in App.tsx via API
    console.log('Backup reminder check - handled by parent component');
  }, []);

  // Run backup reminder check on mount
  useEffect(() => {
    checkBackupReminder();
  }, [checkBackupReminder]);

  // Validate passphrase strength
  const validatePassphrase = useCallback((): boolean => {
    if (!passphrase || passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters long.');
      return false;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return false;
    }

    // Check for reasonable strength
    const hasUpperCase = /[A-Z]/.test(passphrase);
    const hasLowerCase = /[a-z]/.test(passphrase);
    const hasNumbers = /\d/.test(passphrase);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(passphrase);

    const strengthScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

    if (strengthScore < 3) {
      setError('Passphrase should contain uppercase, lowercase, numbers, and special characters for better security.');
      return false;
    }

    return true;
  }, [passphrase, confirmPassphrase]);

  // Create encrypted backup
  const createBackup = useCallback(async (): Promise<string> => {
    await sodium.ready;

    // Gather all account data
    const backupData: BackupData = {
      version: 1,
      timestamp: Date.now(),
      handle: currentUser.handle,
      privateKey: currentUser.privateKey,
      publicKey: currentUser.publicKey,
      backupNotes: backupNotes.trim() || undefined
    };

    // Include recovery words if available
    const recoveryWords = localStorage.getItem('secmes_recovery_words');
    if (recoveryWords) {
      try {
        backupData.recoveryWords = JSON.parse(recoveryWords);
      } catch (error) {
        console.warn('Failed to parse recovery words for backup');
      }
    }

    // Include contacts if available
    const contacts = localStorage.getItem('secmes_contacts');
    if (contacts) {
      try {
        backupData.contacts = JSON.parse(contacts);
      } catch (error) {
        console.warn('Failed to parse contacts for backup');
      }
    }

    // Include settings if available
    const settings = localStorage.getItem('secmes_settings');
    if (settings) {
      try {
        backupData.settings = JSON.parse(settings);
      } catch (error) {
        console.warn('Failed to parse settings for backup');
      }
    }

    // Convert to JSON
    const dataJson = JSON.stringify(backupData);

    // Generate salt for key derivation
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

    // Derive encryption key from passphrase
    const key = sodium.crypto_pwhash(
      32,
      passphrase,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    // Encrypt the data
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(dataJson, nonce, key);

    // Create final backup structure with separate nonce and encrypted data
    const backup = {
      version: '1.0',
      timestamp: backupData.timestamp,
      encryptedData: sodium.to_hex(ciphertext),
      salt: sodium.to_hex(salt),
      nonce: sodium.to_hex(nonce),
      metadata: {
        handle: formatHandle(currentUser.handle),
        backupDate: new Date(backupData.timestamp).toISOString(),
        notes: backupNotes.trim() || undefined
      }
    };

    return JSON.stringify(backup, null, 2);
  }, [currentUser, passphrase, backupNotes]);

  // Handle backup export
  const handleExportBackup = useCallback(async () => {
    if (!validatePassphrase()) {
      return;
    }

    setIsExporting(true);
    setError('');
    setSuccess('');

    try {
      const backupJson = await createBackup();
      
      // Create blob and download
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `secmes-backup-${formatHandle(currentUser.handle)}-${new Date().toISOString().split('T')[0]}.secmes`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update last backup date via API
      try {
        await userApi.recordBackupCreated(currentUser.handle);
        setLastBackupDate(new Date().toLocaleDateString());
      } catch (error) {
        console.error('Failed to record backup date:', error);
        // Continue despite API error - backup file was created successfully
      }
      
      setSuccess('Backup created successfully! Keep your backup file and passphrase secure.');
    } catch (error) {
      console.error('Backup creation failed:', error);
      setError('Failed to create backup. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [validatePassphrase, createBackup, currentUser.handle]);

  // Get auto-destroy guidance
  const getAutoDestroyGuidance = (): string => {
    // General guidance since account age tracking moved to server
    return "Keep backups secure and consider your account importance when deciding retention period";
  };

  // Security warnings component
  const SecurityWarnings: React.FC = () => (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h4 className="font-semibold text-amber-800 mb-2">⚠️ Critical Security Notice</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• Store your backup file and passphrase separately and securely</li>
          <li>• Anyone with both can access your account completely</li>
          <li>• Test recovery process to ensure backup works</li>
          <li>• Create new backup after adding important contacts</li>
        </ul>
      </div>
      
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">💡 Auto-Destroy Guidance</h4>
        <p className="text-sm text-blue-700">{getAutoDestroyGuidance()}</p>
      </div>
      
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-800 mb-2">🚨 Backup Leakage Warning</h4>
        <p className="text-sm text-red-700">
          If you suspect your backup file or passphrase has been compromised, 
          immediately create a new account and securely destroy all old backups.
        </p>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Backup Manager</h2>
          <p className="text-gray-600">Create encrypted backup of your account</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-2xl"
        >
          ×
        </button>
      </div>

      <div className="space-y-6">
        {/* Current Account Info */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">Account Information</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">Handle:</span> {formatHandle(currentUser.handle)}</p>
            {lastBackupDate && (
              <p><span className="font-medium">Last Backup:</span> {lastBackupDate}</p>
            )}
          </div>
        </div>

        {/* Backup Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backup Passphrase *
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter a strong passphrase"
              disabled={isExporting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Passphrase *
            </label>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => {
                setConfirmPassphrase(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Confirm your passphrase"
              disabled={isExporting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backup Notes (Optional)
            </label>
            <textarea
              value={backupNotes}
              onChange={(e) => setBackupNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add notes about this backup..."
              rows={3}
              disabled={isExporting}
            />
          </div>
        </div>

        {/* Security Warnings */}
        <SecurityWarnings />

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">{success}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-4 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExportBackup}
            disabled={isExporting || !passphrase || !confirmPassphrase}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? 'Creating Backup...' : 'Create Backup'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupManager; 