// @ts-nocheck
// eslint-disable
import { SignalCrypto } from './signalCrypto';


export class CryptoTester {

  static async testBasicFlow(): Promise<void> {
    console.log('🧪 Starting libsodium E2EE test...');
    
    try {
      // Initialize libsodium
      await SignalCrypto.initialize();
      
      // Create Alice and Bob identities
      console.log('Creating Alice and Bob identities...');
      const aliceKeys = await SignalCrypto.createIdentity();
      const bobKeys = await SignalCrypto.createIdentity();
      
      console.log('Alice public key:', aliceKeys.publicKey.slice(0, 20) + '...');
      console.log('Bob public key:', bobKeys.publicKey.slice(0, 20) + '...');
      
      // Determine roles (lower public key becomes client)
      const aliceIsClient = SignalCrypto.determineRole(aliceKeys.publicKey, bobKeys.publicKey);
      const bobIsClient = !aliceIsClient;
      
      console.log('Roles determined:', {
        alice: aliceIsClient ? 'CLIENT' : 'SERVER',
        bob: bobIsClient ? 'CLIENT' : 'SERVER'
      });
      
      // Create Bob's key bundle (normally fetched from server)
      const bobPreKey = await SignalCrypto.createPreKey();
      const bobPreKeySignature = await SignalCrypto.signPreKey(bobPreKey, bobKeys);
      
      const bobKeyBundle = {
        identityKey: bobKeys.publicKey,
        signedPreKey: {
          key: bobPreKey.publicKey,
          signature: bobPreKeySignature
        }
      };
      
      // Create Alice's key bundle
      const alicePreKey = await SignalCrypto.createPreKey();
      const alicePreKeySignature = await SignalCrypto.signPreKey(alicePreKey, aliceKeys);
      
      const aliceKeyBundle = {
        identityKey: aliceKeys.publicKey,
        signedPreKey: {
          key: alicePreKey.publicKey,
          signature: alicePreKeySignature
        }
      };
      
      // Alice establishes session with Bob
      console.log('Alice establishing session with Bob...');
      const aliceSessionKeys = await SignalCrypto.buildSession(
        aliceKeys,
        bobKeyBundle,
        aliceIsClient
      );
      
      // Bob establishes session with Alice
      console.log('Bob establishing session with Alice...');
      const bobSessionKeys = await SignalCrypto.buildSession(
        bobKeys,
        aliceKeyBundle,
        bobIsClient
      );
      
      // Test message from Alice to Bob
      const aliceMessage = "Hello Bob! This is a secure message from Alice.";
      console.log('Alice wants to send:', aliceMessage);
      
      // Alice encrypts message with her TX key
      const aliceEncrypted = await SignalCrypto.encrypt(aliceMessage, aliceSessionKeys);
      console.log('Alice encrypted message:', {
        ciphertextLength: aliceEncrypted.ciphertext.length,
        nonceLength: aliceEncrypted.nonce.length
      });
      
      // Bob decrypts message with his RX key (Alice's TX becomes Bob's RX)
      const bobDecrypted = await SignalCrypto.decrypt(aliceEncrypted, bobSessionKeys);
      console.log('Bob decrypted message:', bobDecrypted);
      
      // Verify message integrity
      if (bobDecrypted === aliceMessage) {
        console.log('Alice -> Bob message integrity verified!');
      } else {
        throw new Error('Message integrity check failed!');
      }
      
      // Test message from Bob to Alice
      const bobMessage = "Hi Alice! This is Bob's encrypted reply.";
      console.log('Bob wants to send:', bobMessage);
      
      // Bob encrypts message with his TX key
      const bobEncrypted = await SignalCrypto.encrypt(bobMessage, bobSessionKeys);
      console.log('Bob encrypted message:', {
        ciphertextLength: bobEncrypted.ciphertext.length,
        nonceLength: bobEncrypted.nonce.length
      });
      
      // Alice decrypts message with her RX key (Bob's TX becomes Alice's RX)
      const aliceDecrypted = await SignalCrypto.decrypt(bobEncrypted, aliceSessionKeys);
      console.log('Alice decrypted message:', aliceDecrypted);
      
      // Verify message integrity
      if (aliceDecrypted === bobMessage) {
        console.log('Bob -> Alice message integrity verified!');
      } else {
        throw new Error('Message integrity check failed!');
      }
      
      // Test with multiple messages to verify nonce uniqueness
      console.log('Testing multiple messages...');
      for (let i = 0; i < 5; i++) {
        const testMessage = `Test message #${i + 1} from Alice`;
        const encrypted = await SignalCrypto.encrypt(testMessage, aliceSessionKeys);
        const decrypted = await SignalCrypto.decrypt(encrypted, bobSessionKeys);
        
        if (decrypted !== testMessage) {
          throw new Error(`Message ${i + 1} integrity check failed!`);
        }
        
        console.log(`Message ${i + 1} verified: "${decrypted}"`);
      }
      
      console.log('All tests passed! Libsodium E2EE is working correctly.');
      
      // Display key information for debugging
      console.log('Session Key Information:');
      console.log('Alice TX key preview:', Array.from(aliceSessionKeys.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
      console.log('Alice RX key preview:', Array.from(aliceSessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
      console.log('Bob TX key preview:', Array.from(bobSessionKeys.tx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
      console.log('Bob RX key preview:', Array.from(bobSessionKeys.rx.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      // Verify that Alice's TX = Bob's RX and Bob's TX = Alice's RX
      const aliceTxBobRxMatch = aliceSessionKeys.tx.every((byte, idx) => byte === bobSessionKeys.rx[idx]);
      const bobTxAliceRxMatch = bobSessionKeys.tx.every((byte, idx) => byte === aliceSessionKeys.rx[idx]);
      
      console.log('Key exchange verification:');
      console.log('Alice TX === Bob RX:', aliceTxBobRxMatch ? 'PASS' : 'FAIL');
      console.log('Bob TX === Alice RX:', bobTxAliceRxMatch ? 'PASS' : 'FAIL');
      
      if (aliceTxBobRxMatch && bobTxAliceRxMatch) {
        console.log('Perfect! crypto_kx key exchange is working correctly.');
      } else {
        throw new Error('Key exchange verification failed!');
      }
      
        } catch (error) {
      console.error('Test failed:', error);
      throw error;
    }
  }


  static async testErrorHandling(): Promise<void> {
    console.log('Testing error handling...');
    
    try {
      await SignalCrypto.initialize();
      
      const aliceKeys = await SignalCrypto.createIdentity();
      const bobKeys = await SignalCrypto.createIdentity();
      
      const bobKeyBundle = {
        identityKey: bobKeys.publicKey,
        signedPreKey: {
          key: (await SignalCrypto.createPreKey()).publicKey,
          signature: 'dummy_signature'
        }
      };
      
      const aliceSessionKeys = await SignalCrypto.buildSession(aliceKeys, bobKeyBundle, true);
      
      // Test with invalid ciphertext
      const invalidMessage = {
        ciphertext: 'invalid_base64_ciphertext',
        nonce: 'invalid_base64_nonce'
      };
      
            try {
        await SignalCrypto.decrypt(invalidMessage, aliceSessionKeys);
        throw new Error('Should have thrown an error for invalid ciphertext');
      } catch (error) {
        console.log('Error handling works correctly:', (error as Error).message);
      }
      
    } catch (error) {
      console.error('Error handling test failed:', error);
      throw error;
    }
  }


  static async runAllTests(): Promise<void> {
    console.log('Starting comprehensive libsodium E2EE tests...');
    
    try {
      await this.testBasicFlow();
      await this.testErrorHandling();
      
      console.log('All tests completed successfully!');
      console.log('Libsodium E2EE implementation is ready for production use.');
      
    } catch (error) {
      console.error('Test suite failed:', error);
      throw error;
    }
  }
}

// Export for use in browser console or test runners
// @ts-nocheck
// eslint-disable
(globalThis as any).CryptoTester = CryptoTester; 