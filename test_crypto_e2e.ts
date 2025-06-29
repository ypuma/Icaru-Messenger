import libsodium from 'libsodium-wrappers';
import * as bip39 from 'bip39';
import { generateMnemonic, deriveKeyPairFromMnemonic, deriveHandleFromPublicKey } from './packages/web-app/src/lib/crypto/account.ts';
import { SignalCrypto as FrontCrypto } from './packages/web-app/src/lib/crypto/signalCrypto.ts';
import { SignalCrypto as BackCrypto } from './packages/backend/src/crypto/signalCrypto.ts';

(async () => {
  console.log('--- Secure Messenger End-to-End Crypto Self-test ---');
  // 1. Generate account via mnemonic
  const mnemonic = generateMnemonic();
  console.log('Mnemonic:', mnemonic);
  const kpHex = await deriveKeyPairFromMnemonic(mnemonic);
  const handle = deriveHandleFromPublicKey(kpHex.pubKey);
  console.log('Handle:', handle);

  // Convert hex key to libsodium URL-safe base64 (as stored on server)
  await libsodium.ready;
  const sodium = libsodium;
  const pubBytes = sodium.from_hex(kpHex.pubKey);
  const pubB64 = sodium.to_base64(pubBytes, sodium.base64_variants.URLSAFE_NO_PADDING);

  // 2. Simulate server stored account (backend identity in base64 urlsafe)
  await BackCrypto.initialize();
  await FrontCrypto.initialize();

  const backendIdentity = await BackCrypto.createIdentity();

  // Build key bundles (minimal for test)
  const bundleForUser = {
    identityKey: backendIdentity.publicKey,
    signedPreKey: { key: backendIdentity.publicKey, signature: '' },
  } as any;
  const bundleForBackend = {
    identityKey: pubB64,
    signedPreKey: { key: pubB64, signature: '' },
  } as any;

  // Local user keypair as KeyPair (hex priv/pub)
  const userKeyPair = { publicKey: kpHex.pubKey, privateKey: kpHex.privKey } as any;

  // 3. Derive session keys (roles decided automatically)
  const sessionUser = await FrontCrypto.buildSession(userKeyPair, bundleForUser, undefined);
  const sessionBackend = await BackCrypto.buildSession(backendIdentity, bundleForBackend, undefined);

  const preview = (u: Uint8Array) => Array.from(u.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('User tx:', preview(sessionUser.tx), 'Backend rx:', preview(sessionBackend.rx));
  console.log('Backend tx:', preview(sessionBackend.tx), 'User rx:', preview(sessionUser.rx));

  if (preview(sessionUser.tx) !== preview(sessionBackend.rx) || preview(sessionBackend.tx) !== preview(sessionUser.rx)) {
    throw new Error('Session key mismatch!');
  }

  // 4. Encrypt a message on user side, decrypt on backend
  const message = 'Hello secure world!';
  const packet = await FrontCrypto.encrypt(message, sessionUser);
  const plaintext = await BackCrypto.decrypt(packet, sessionBackend);

  if (plaintext !== message) throw new Error('Decryption failed');

  console.log('Success: Encryption/decryption round-trip passed');
})(); 