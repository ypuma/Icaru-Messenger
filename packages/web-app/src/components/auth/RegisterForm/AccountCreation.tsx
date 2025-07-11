import React, { useState, useEffect, useRef } from 'react';
import {
  generateMnemonic,
  deriveKeyPairFromMnemonic,
  deriveHandleFromPublicKey,
} from '../../../lib/crypto/account';
import { storageManager } from '../../../lib/storage/secureStorage';
import { Buffer } from 'buffer';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://0.0.0.0:11401';

// This type is now consistent with storage interfaces
interface KeyPair {
  pubKey: string;
  privKey: string;
}

interface AccountCreationProps {
  onAccountCreated: (accountData: any) => void;
}

const AccountCreation: React.FC<AccountCreationProps> = ({ onAccountCreated }) => {
  const [step, setStep] = useState<'generate' | 'confirm' | 'store'>('generate');
  const [handle, setHandle] = useState<string>('');
  const [identityKeys, setIdentityKeys] = useState<KeyPair | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string>('');
  const [phraseConfirmed, setPhraseConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref to prevent double generation due to StrictMode
  const generationInProgress = useRef(false);
  const hasGenerated = useRef(false);

  // Generate all account data deterministically from a new mnemonic
  const generateAccountData = async () => {
    // Prevent double execution in StrictMode
    if (generationInProgress.current || (hasGenerated.current && recoveryPhrase)) {
      console.log('Konto-Generierung übersprungen - bereits in Arbeit oder bereits abgeschlossen');
      return;
    }
    
    generationInProgress.current = true;
    setLoading(true);
    setError(null);
    try {
      // 1. Generate mnemonic
      const mnemonic = generateMnemonic();
      setRecoveryPhrase(mnemonic);

      console.log('=== Account Creation Debug ===');
      console.log('Generated mnemonic:', mnemonic);

      // 2. Derive key pair from mnemonic (using libsodium for compatibility)
      const keyPair = await deriveKeyPairFromMnemonic(mnemonic);
      setIdentityKeys(keyPair);

      console.log('Derived public key (hex):', keyPair.pubKey);
      console.log('Derived private key (hex):', keyPair.privKey);
      console.log('Converting to base64 for storage...');
      const publicKeyBase64 = Buffer.from(keyPair.pubKey, 'hex').toString('base64');
      console.log('Public key (base64):', publicKeyBase64);

      // 3. Derive handle from public key
      console.log('Public key for handle derivation:', keyPair.pubKey, 'length:', keyPair.pubKey?.length);
      const derivedHandle = deriveHandleFromPublicKey(keyPair.pubKey);
      console.log('Derived handle:', derivedHandle);
      setHandle(derivedHandle);
      
      hasGenerated.current = true;
      setStep('confirm');
    } catch (err) {
      console.error('Failed to generate account data:', err);
      setError(err instanceof Error ? err.message : 'Ein unerwarteter Fehler ist während der Konto-Generierung aufgetreten.');
    } finally {
      setLoading(false);
      generationInProgress.current = false;
    }
  };

  useEffect(() => {
    generateAccountData();
  }, []);

  const confirmAccount = async () => {
    if (!phraseConfirmed) {
      setError('Bitte bestätigen Sie, dass Sie Ihre Wiederherstellungsphrase sicher gespeichert haben.');
      return;
    }

    if (!recoveryPhrase || !handle) {
      setError('Fehlende Kontodaten. Bitte versuchen Sie es erneut.');
      return;
    }

    setLoading(true);
    setError(null);
    setStep('store');

    try {
      // Re-derive keys from the current recovery phrase to ensure consistency
      const keyPair = await deriveKeyPairFromMnemonic(recoveryPhrase);
      
      // Create account on backend - convert hex pubKey to base64
      const publicKeyBase64 = Buffer.from(keyPair.pubKey, 'hex').toString('base64');
      
      console.log('=== CONFIRM ACCOUNT DEBUG ===');
      console.log('Using recovery phrase:', recoveryPhrase);
      console.log('Re-derived public key (hex):', keyPair.pubKey);
      console.log('Re-derived public key (base64):', publicKeyBase64);
      console.log('Handle to create:', handle);
      
      const accountData = {
        handle: handle, // Use the raw handle which is already in ABC-123 format
        publicKey: publicKeyBase64, // Store libsodium-derived key for recovery lookup
      };

      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Konto-Erstellung fehlgeschlagen');
      }
      
      const result = await response.json();
      console.log('Konto auf dem Backend erstellt:', result);

      // Store account data locally using the re-derived keys
      await storageManager.initialize(recoveryPhrase);
      const accountToStore = {
        handle: handle,
        identityKeyPair: keyPair,
        preKeyBundle: {}, // Simple placeholder since we're using libsodium
        recoveryPhrase: recoveryPhrase,
        createdAt: new Date()
      };
      await storageManager.getStorage().storeAccount(accountToStore);

      // Notify parent component with the re-derived keys
      onAccountCreated({
        handle: handle, // Use the raw handle which is already in ABC-123 format
        publicKey: keyPair.pubKey,
        privateKey: keyPair.privKey,
        accountId: result.account?.id
      });

    } catch (err) {
      console.error('Account creation failed:', err);
      setError(err instanceof Error ? err.message : 'Ein unerwarteter Fehler ist während der Konto-Erstellung aufgetreten.');
      setStep('confirm'); // Go back to confirmation step on error
    } finally {
      setLoading(false);
    }
  };


  const renderGenerationStep = () => (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Generieren Sie Ihr Sichere Konto</h2>
      <p className="text-gray-400 mb-6">Bitte warten Sie, während wir Ihren eindeutigen Handle und Schlüssel erstellen.</p>
      {loading && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>}
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );

  const renderConfirmationStep = () => (
    <div>
      <h2 className="text-2xl font-bold text-center mb-4">Ihr neues Konto</h2>
      
      <div className="mb-6">
        <p className="text-gray-400 text-center">Ihr eindeutiger, anonymer Handle ist:</p>
        <p className="text-3xl font-mono text-center bg-gray-800 rounded-md p-3 my-2">{handle}</p>
      </div>

      <div className="mb-6 p-4 border border-yellow-500 rounded-md">
        <h3 className="text-lg font-bold text-yellow-400 mb-2">Speichern Sie Ihre Wiederherstellungsphrase!</h3>
        <p className="text-gray-300 mb-4">Dies ist der einzige Weg, um Ihr Konto wiederherzustellen. Speichern Sie es an einem sicheren und offline-Speicherort.</p>
        <div className="bg-gray-800 rounded-md p-4 text-center font-mono text-lg select-all">
          {recoveryPhrase}
        </div>
        <button
          onClick={() => {
            // Reset flags when manually regenerating
            hasGenerated.current = false;
            generateAccountData();
          }}
          className="text-sm text-blue-400 hover:underline mt-2"
          disabled={loading}
        >
          Regenerieren
        </button>
      </div>

      <div className="flex items-center mb-6">
        <input
          id="confirm-phrase"
          type="checkbox"
          checked={phraseConfirmed}
          onChange={(e) => setPhraseConfirmed(e.target.checked)}
          className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
        />
        <label htmlFor="confirm-phrase" className="ml-2 text-gray-300">
          Ich habe meine Wiederherstellungsphrase sicher gespeichert.
        </label>
      </div>
      
      <button
        onClick={confirmAccount}
        disabled={!phraseConfirmed || loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md disabled:bg-gray-500"
      >
        {loading ? 'Konto erstellen...' : 'Konto erstellen'}
      </button>

      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
    </div>
  );

  const renderStorageStep = () => (
     <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Sichern Sie Ihr Konto</h2>
      <p className="text-gray-400 mb-6">Verschlüsseln und speichern Sie Ihre Kontodaten lokal...</p>
      {loading && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>}
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 'generate':
        return renderGenerationStep();
      case 'confirm':
        return renderConfirmationStep();
      case 'store':
        return renderStorageStep();
      default:
        return renderGenerationStep();
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-8 bg-gray-900 rounded-lg shadow-lg">
      {renderStep()}
    </div>
  );
};

export default AccountCreation; 