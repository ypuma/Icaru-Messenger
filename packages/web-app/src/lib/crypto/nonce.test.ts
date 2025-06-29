// @ts-nocheck
// eslint-disable
import { SignalCrypto } from './signalCrypto';
import sodium from 'libsodium-wrappers';
import { toB64, fromB64 } from '../utils/base64';

describe('SignalCrypto nonce handling', () => {
  it('produces a 24-byte nonce encoded to 32-char base64 string', async () => {
    await SignalCrypto.initialize();

    const dummyKeys = await SignalCrypto.createIdentity();
    const packet = await SignalCrypto.encrypt('hello', { tx: new Uint8Array(32), rx: new Uint8Array(32) } as any);

    expect(packet.n.length).toBe(32);
    const nonceBytes = fromB64(packet.n);
    expect(nonceBytes.byteLength).toBe(sodium.crypto_secretbox_NONCEBYTES);
  });

  it('round-trips alice→bob without error', async () => {
    await sodium.ready;

    // Generate two identities
    const alice = await SignalCrypto.createIdentity();
    const bob   = await SignalCrypto.createIdentity();

    // Derive session keys the simple way using crypto_kx
    const clientKeys = sodium.crypto_kx_client_session_keys(
      sodium.from_base64(alice.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING),
      sodium.from_base64(alice.privateKey, sodium.base64_variants.URLSAFE_NO_PADDING),
      sodium.from_base64(bob.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING)
    );
    const serverKeys = sodium.crypto_kx_server_session_keys(
      sodium.from_base64(bob.publicKey,   sodium.base64_variants.URLSAFE_NO_PADDING),
      sodium.from_base64(bob.privateKey,  sodium.base64_variants.URLSAFE_NO_PADDING),
      sodium.from_base64(alice.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING)
    );

    const aliceSession = { tx: clientKeys.sharedTx, rx: clientKeys.sharedRx } as any;
    const bobSession   = { tx: serverKeys.sharedTx, rx: serverKeys.sharedRx } as any;

    const msg = 'secure';
    const packet = await SignalCrypto.encrypt(msg, aliceSession);
    const plain  = await SignalCrypto.decrypt(packet, bobSession);

    expect(plain).toBe(msg);
  });
}); 