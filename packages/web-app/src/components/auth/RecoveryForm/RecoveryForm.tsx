import React, { useState } from 'react';

interface RecoveryFormProps {
  onRecover: (seedPhrase: string) => void;
}

const RecoveryForm: React.FC<RecoveryFormProps> = ({ onRecover }) => {
  const [seedPhrase, setSeedPhrase] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRecover(seedPhrase);
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
          onChange={(e) => setSeedPhrase(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Geben Sie Ihre 12-Wort-Wiederherstellungsphrase ein..."
          required
        />
      </div>

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
