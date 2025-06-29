import * as bip39 from 'bip39';
import { Buffer } from 'buffer';
import sodium from 'libsodium-wrappers';


/**
 * Generate a new 12-word BIP39 mnemonic phrase.
 * @returns {string} A 12-word mnemonic phrase.
 */
export const generateMnemonic = (): string => {
  return bip39.generateMnemonic(128);
};

/**
 * Derives a Curve25519 key pair from a mnemonic phrase using libsodium.
 * This matches the backend's key generation method for compatibility.
 * @param {string} mnemonic - The 12-word mnemonic phrase.
 * @returns {{ publicKey: string; privateKey: string }} The derived key pair.
 */
export const deriveKeyPairFromMnemonic = async (mnemonic: string): Promise<{ pubKey: string; privKey: string; }> => {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  
  await sodium.ready;
  const seed = await bip39.mnemonicToSeed(mnemonic);
  
  // Use the first 32 bytes of the seed for libsodium key generation
  const seedBytes = seed.slice(0, 32);
  
  // Generate Curve25519 keys using libsodium (same as backend)
  const keyPair = sodium.crypto_box_seed_keypair(seedBytes);
  
  const result = {
    privKey: Buffer.from(keyPair.privateKey).toString('hex'),
    pubKey: Buffer.from(keyPair.publicKey).toString('hex'),
  };
  
  console.log('Generated key pair:', { pubKeyLength: result.pubKey.length, privKeyLength: result.privKey.length });
  return result;
};

/**
 * Derives a handle in format ABC-123 from a public key.
 * This is a deterministic method for generating a user-friendly handle 
 * that conforms to the backend validation ^[A-Z]{3}-\d{3}$.
 * @param {string} publicKey - The public key (hex string).
 * @returns {string} A handle in format ABC-123.
 */
export const deriveHandleFromPublicKey = (publicKey: string): string => {
  console.log('deriveHandleFromPublicKey called with:', { publicKey, type: typeof publicKey, length: publicKey?.length });
  
  if (!publicKey || publicKey.length < 12) {
    throw new Error(`Invalid public key for handle derivation. Got: ${publicKey} (type: ${typeof publicKey}, length: ${publicKey?.length})`);
  }

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '23456789';

  // Use the first 3 bytes for letters, next 3 for numbers to ensure determinism
  const letterPart = publicKey.substring(0, 6);
  const numberPart = publicKey.substring(6, 12);

  let handleLetters = '';
  for (let i = 0; i < 3; i++) {
    const hexByte = letterPart.substring(i * 2, i * 2 + 2);
    const byte = parseInt(hexByte, 16);
    if (isNaN(byte)) {
      throw new Error('Invalid hex in public key');
    }
    handleLetters += letters[byte % 26];
  }

  let handleNumbers = '';
  for (let i = 0; i < 3; i++) {
    const hexByte = numberPart.substring(i * 2, i * 2 + 2);
    const byte = parseInt(hexByte, 16);
    if (isNaN(byte)) {
      throw new Error('Invalid hex in public key');
    }
    handleNumbers += numbers[byte % 8];
  }

  return `${handleLetters}-${handleNumbers}`;
};

/**
 * Formats a handle (now handles are already formatted by deriveHandleFromPublicKey).
 * @param {string} handle - The handle.
 * @returns {string} The formatted handle.
 */
export const formatHandle = (handle: string): string => {
  // Handle is already formatted as ABC-123 by deriveHandleFromPublicKey
  return handle;
}; 