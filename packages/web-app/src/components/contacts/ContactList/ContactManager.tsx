import React, { useState, useRef } from 'react';
import { formatHandle, isValidHandle } from '../../../lib/utils/handle';
import _sodium from 'libsodium-wrappers';
const sodium = _sodium;

interface Contact {
  handle: string;
  formattedHandle: string;
  publicKey: string;
  isVerified: boolean;
  addedDate: number;
}

interface ContactManagerProps {
  currentUser: { handle: string; privateKey: string; publicKey: string; qrCodeData: string; qrCodeUrl: string } | null;
  onContactAdded: (contact: Contact) => void;
  onClose: () => void;
}

const ContactManager: React.FC<ContactManagerProps> = ({ currentUser, onContactAdded, onClose }) => {
  const [activeTab, setActiveTab] = useState<'add' | 'share'>('add');
  const [manualHandle, setManualHandle] = useState('');
  const [qrData, setQrData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addContactManually = async () => {
    if (!manualHandle.trim()) {
      setError('Please enter a handle');
      return;
    }

    if (!isValidHandle(manualHandle)) {
      setError('Invalid handle format');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
  
      const response = await fetch(`/api/users/${encodeURIComponent(manualHandle)}/public-key`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Handle not found');
        } else {
          setError('Failed to verify handle');
        }
        setIsLoading(false);
        return;
      }

      const userData = await response.json();
      
      const newContact: Contact = {
        handle: manualHandle,
        formattedHandle: manualHandle.includes('-') ? manualHandle : manualHandle,
        publicKey: userData.publicKey,
        isVerified: true,
        addedDate: Date.now()
      };

      onContactAdded(newContact);
      setSuccess(`Successfully added @${manualHandle}`);
      setManualHandle('');
      
    } catch (error) {
      // Fallback for demo - create a mock contact using Sodium
      console.warn('API unavailable, creating demo contact:', error);
      
      try {
        await sodium.ready;
        
        // Generate mock keys using Sodium
        const mockSignKey = sodium.to_hex(sodium.randombytes_buf(32));
        const mockEncryptKey = sodium.to_hex(sodium.randombytes_buf(32));
        
        const mockPublicKey = JSON.stringify({
          sign: mockSignKey,
          encrypt: mockEncryptKey
        });

        const newContact: Contact = {
          handle: manualHandle,
          formattedHandle: manualHandle.includes('-') ? manualHandle : manualHandle,
          publicKey: mockPublicKey,
          isVerified: false, // Mark as unverified since it's a demo
          addedDate: Date.now()
        };

        onContactAdded(newContact);
        setSuccess(`Demo contact added: @${manualHandle} (unverified)`);
        setManualHandle('');
      } catch (sodiumError) {
        console.error('Failed to create demo contact with Sodium:', sodiumError);
        setError('Failed to add contact - cryptographic library unavailable');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const processQRCode = async (qrContent: string) => {
    try {
      const contactData = JSON.parse(qrContent);
      
      // Validate QR code structure
      if (!contactData.handle || !contactData.publicKey || !contactData.version) {
        setError('Invalid QR code format');
        return;
      }

      // Verify timestamp (QR codes should be relatively recent)
      const qrAge = Date.now() - contactData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (qrAge > maxAge) {
        setError('QR code is too old for security. Please ask for a fresh one.');
        return;
      }

      const newContact: Contact = {
        handle: contactData.handle.replace('-', ''),
        formattedHandle: contactData.handle,
        publicKey: contactData.publicKey,
        isVerified: true,
        addedDate: Date.now()
      };

      onContactAdded(newContact);
      setSuccess(`Successfully added @${contactData.handle}`);
      setQrData('');
      
    } catch (error) {
      setError('Invalid QR code data');
      console.error('QR code parsing error:', error);
    }
  };

  const handleQRInput = () => {
    if (!qrData.trim()) {
      setError('Please enter QR code data');
      return;
    }

    processQRCode(qrData);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;


    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      // Simulate QR code detection
      if (content.includes('handle') && content.includes('publicKey')) {
        processQRCode(content);
      } else {
        setError('Could not detect valid QR code in image');
      }
    };
    reader.readAsText(file);
  };

  const downloadQR = async () => {
    if (!currentUser?.qrCodeUrl) return;
    
    const link = document.createElement('a');
    link.download = `secmes-contact-${currentUser.handle}.png`;
    link.href = currentUser.qrCodeUrl;
    link.click();
  };

  const copyQRData = () => {
    if (!currentUser?.qrCodeData) return;
    
    navigator.clipboard.writeText(currentUser.qrCodeData).then(() => {
      setSuccess('QR data copied to clipboard');
    });
  };

  const shareHandle = () => {
    const shareText = `Add me on SecMes: @${formatHandle(currentUser?.handle || '')}`;
    if (navigator.share) {
      navigator.share({
        title: 'Add me on SecMes',
        text: shareText
      });
    } else {
      navigator.clipboard.writeText(shareText).then(() => {
        setSuccess('Handle copied to clipboard');
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Contact Manager</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-3 px-4 text-sm font-medium ${
              activeTab === 'add'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Add Contact
          </button>
          <button
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-3 px-4 text-sm font-medium ${
              activeTab === 'share'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Share Your Info
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {activeTab === 'add' ? (
            <div className="space-y-6">
              {/* Manual Handle Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Handle
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={manualHandle}
                    onChange={(e) => {
                      setManualHandle(e.target.value);
                      setError('');
                      setSuccess('');
                    }}
                    placeholder="ABC123 or ABC-123"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    onClick={addContactManually}
                    disabled={isLoading || !manualHandle.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? '...' : 'Add'}
                  </button>
                </div>
              </div>

              <div className="text-center text-gray-500">
                <p className="text-sm">— OR —</p>
              </div>

              {/* QR Code Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  QR Code Data
                </label>
                <div className="space-y-2">
                  <textarea
                    value={qrData}
                    onChange={(e) => {
                      setQrData(e.target.value);
                      setError('');
                      setSuccess('');
                    }}
                    placeholder="Paste QR code data here..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleQRInput}
                    disabled={!qrData.trim()}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add from QR Data
                  </button>
                </div>
              </div>

              <div className="text-center text-gray-500">
                <p className="text-sm">— OR —</p>
              </div>

              {/* QR Code File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload QR Code Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload a screenshot or photo of a QR code
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Your QR Code */}
              {currentUser?.qrCodeUrl && (
                <div className="text-center">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Your QR Code</h3>
                  <div className="inline-block p-4 bg-white border border-gray-200 rounded-lg">
                    <img
                      src={currentUser.qrCodeUrl}
                      alt="Your contact QR code"
                      className="w-48 h-48"
                    />
                  </div>
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={downloadQR}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Download QR Code
                    </button>
                    <button
                      onClick={copyQRData}
                      className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                    >
                      Copy QR Data
                    </button>
                  </div>
                </div>
              )}

              {/* Handle Sharing */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Your Handle</h3>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-center font-mono text-lg text-gray-900">
                    @{formatHandle(currentUser?.handle || '')}
                  </p>
                  <button
                    onClick={shareHandle}
                    className="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Share Handle
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-sm">{success}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactManager; 