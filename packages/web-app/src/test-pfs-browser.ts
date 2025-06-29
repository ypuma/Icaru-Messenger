// Simple browser test for PFS implementation
import { SignalCrypto } from './lib/crypto/signalCrypto';
import { PerfectForwardSecrecy } from './lib/crypto/perfectForwardSecrecy';
import { PFSIntegration } from './lib/crypto/pfsIntegration';

export async function testPFSInBrowser() {
  console.log('🧪 Testing Perfect Forward Secrecy in Browser');
  
  try {
    // Initialize crypto
    await SignalCrypto.initialize();
    console.log('✅ SignalCrypto initialized');
    
    // Create test session keys
    const identity1 = await SignalCrypto.createIdentity();
    const identity2 = await SignalCrypto.createIdentity();
    console.log('✅ Test identities created');
    
    // Build session
    const preKey = await SignalCrypto.createPreKey();
    const signature = await SignalCrypto.signPreKey(preKey, identity2);
    const keyBundle = {
      identityKey: identity2.publicKey,
      signedPreKey: {
        key: preKey.publicKey,
        signature: signature
      }
    };
    
    const sessionKeys = await SignalCrypto.buildSession(identity1, keyBundle, true);
    console.log('✅ Session keys established');
    
    // Initialize PFS
    const ratchetState = await SignalCrypto.initializeRatchet(sessionKeys);
    console.log('✅ Ratchet state initialized');
    
    // Test encryption/decryption with PFS
    const testMessage = "Hello PFS World!";
    const encryptResult = await SignalCrypto.encryptWithPFS(testMessage, ratchetState);
    console.log('✅ Message encrypted with PFS:', {
      messageNumber: encryptResult.cipherPacket.messageNumber,
      chainLength: encryptResult.cipherPacket.previousChainLength
    });
    
    const decryptResult = await SignalCrypto.decryptWithPFS(
      encryptResult.cipherPacket, 
      encryptResult.newRatchetState
    );
    console.log('✅ Message decrypted with PFS:', decryptResult.message);
    
    if (decryptResult.message === testMessage) {
      console.log('🎉 PFS test successful!');
      return { success: true, message: 'Perfect Forward Secrecy is working correctly' };
    } else {
      throw new Error('Decrypted message does not match original');
    }
    
  } catch (error) {
    console.error('❌ PFS test failed:', error);
    return { success: false, error: error.message };
  }
}

// Expose to window for manual testing
if (typeof window !== 'undefined') {
  (window as any).testPFSInBrowser = testPFSInBrowser;
}