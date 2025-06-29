// packages/web-app/src/lib/crypto/libsignal-client-stub.ts

// This file acts as a browser-friendly stub for the @signalapp/libsignal-client package,
// which cannot be bundled for the browser due to its native Node.js dependencies.

// Exporting null or placeholder values for the expected exports of the library.
// This allows the application to import the module without crashing and to
// gracefully fallback to alternative crypto implementations (like Web Crypto API).

export const SignalProtocolAddress = null;
export const SessionBuilder = null;
export const SessionCipher = null;
export const PreKeyBundle = null;
export const PreKeyMessage = null;
export const SenderKeyMessage = null;
export const SenderKeyDistributionMessage = null;
export const SignedPreKey = null;
export const KeyHelper = null;

// Default export can be a simple object or null
export default {
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  PreKeyBundle,
  PreKeyMessage,
  SenderKeyMessage,
  SenderKeyDistributionMessage,
  SignedPreKey,
  KeyHelper,
}; 