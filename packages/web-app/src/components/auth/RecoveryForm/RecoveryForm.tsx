import React, { useState } from 'react';
import * as bip39 from 'bip39';

interface RecoveryFormProps {
  onRecover: (seedPhrase: string) => void;
}

const RecoveryForm: React.FC<RecoveryFormProps> = ({ onRecover }) => {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = seedPhrase.trim();
    
    if (!trimmed) {
      setError('Bitte geben Sie Ihre Wiederherstellungsphrase ein.');
      return;
    }
    
    const words = trimmed.toLowerCase().split(/\s+/);
    if (words.length !== 12) {
      setError('Wiederherstellungsphrase muss genau 12 Wörter enthalten.');
      return;
    }
    
    if (!bip39.validateMnemonic(words.join(' '))) {
      setError('Ungültige Wiederherstellungsphrase.');
      return;
    }
    
    setError(null);
    onRecover(trimmed);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const pastedText = e.clipboardData.getData('text');
      if (!pastedText) return;

      const words = pastedText.trim().toLowerCase().split(/\s+/);
      
      // Auto-validate and format pasted recovery phrase
      if (words.length === 12) {
        if (bip39.validateMnemonic(words.join(' '))) {
          setSeedPhrase(words.join(' '));
          setError(null);
        } else {
          setError('Ungültige Wiederherstellungsphrase eingefügt.');
        }
      }
    } catch (err) {
      console.error('Paste error:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSeedPhrase(e.target.value);
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="seed" className="sr-only">
          Recovery Phrase
        </label>
        <textarea
          id="seed"
          name="seed"
          rows={3}
          value={seedPhrase}
          onChange={handleChange}
          onPaste={handlePaste}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Geben Sie Ihre 12-Wort-Wiederherstellungsphrase ein oder fügen Sie sie mit Strg+V ein..."
          required
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}

      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Recover Account
      </button>
    </form>
  );
};

export default RecoveryForm;
