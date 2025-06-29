import sodium from 'libsodium-wrappers';
import { RatchetState, EphemeralKeys } from '@secure-messenger/shared';

const CHAIN_KEY_CONSTANT = new Uint8Array([0x02]);
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x01]);
const ROOT_KEY_CONTEXT = 'PFSROOT0';

export class PerfectForwardSecrecy {
  static async initialize(): Promise<void> {
    await sodium.ready;
  }

  static async initializeRatchet(sessionKey: Uint8Array): Promise<RatchetState> {
    await sodium.ready;
    
    const rootKey = sodium.crypto_kdf_derive_from_key(
      32,
      1,
      ROOT_KEY_CONTEXT,
      sessionKey
    );
    
    const sendingChainKey = sodium.crypto_kdf_derive_from_key(
      32,
      2,
      ROOT_KEY_CONTEXT,
      sessionKey
    );
    
    const receivingChainKey = sodium.crypto_kdf_derive_from_key(
      32,
      3,
      ROOT_KEY_CONTEXT,
      sessionKey
    );

    return {
      rootKey,
      sendingChainKey,
      receivingChainKey,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendingChainLength: 0,
      skippedKeys: new Map<number, Uint8Array>()
    };
  }

  static async deriveMessageKeys(chainKey: Uint8Array): Promise<EphemeralKeys> {
    await sodium.ready;
    
    const messageKey = sodium.crypto_auth(MESSAGE_KEY_CONSTANT, chainKey);
    const nextChainKey = sodium.crypto_auth(CHAIN_KEY_CONSTANT, chainKey);
    
    return {
      messageKey: messageKey.slice(0, 32),
      nextChainKey: nextChainKey.slice(0, 32)
    };
  }

  static async advanceChain(ratchetState: RatchetState): Promise<RatchetState> {
    const { messageKey, nextChainKey } = await this.deriveMessageKeys(ratchetState.sendingChainKey);
    
    const newState: RatchetState = {
      ...ratchetState,
      sendingChainKey: nextChainKey,
      sendMessageNumber: ratchetState.sendMessageNumber + 1
    };

    this.zeroizeKey(messageKey);
    
    return newState;
  }

  static async rotateKeys(ratchetState: RatchetState, interval: number = 100): Promise<RatchetState> {
    if (ratchetState.sendMessageNumber % interval === 0 && ratchetState.sendMessageNumber > 0) {
      const newRootKey = sodium.crypto_kdf_derive_from_key(
        32,
        ratchetState.sendMessageNumber,
        ROOT_KEY_CONTEXT,
        ratchetState.rootKey
      );
      
      const newSendingChainKey = sodium.crypto_kdf_derive_from_key(
        32,
        1,
        ROOT_KEY_CONTEXT,
        newRootKey
      );
      
      const newReceivingChainKey = sodium.crypto_kdf_derive_from_key(
        32,
        2,
        ROOT_KEY_CONTEXT,
        newRootKey
      );

      this.zeroizeKey(ratchetState.rootKey);
      this.zeroizeKey(ratchetState.sendingChainKey);
      this.zeroizeKey(ratchetState.receivingChainKey);

      return {
        ...ratchetState,
        rootKey: newRootKey,
        sendingChainKey: newSendingChainKey,
        receivingChainKey: newReceivingChainKey,
        previousSendingChainLength: ratchetState.sendMessageNumber
      };
    }
    
    return ratchetState;
  }

  static async encryptWithPFS(
    message: string,
    ratchetState: RatchetState
  ): Promise<{ cipherPacket: any; newRatchetState: RatchetState }> {
    await sodium.ready;
    
    const { messageKey, nextChainKey } = await this.deriveMessageKeys(ratchetState.sendingChainKey);
    
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const messageBytes = sodium.from_string(message);
    const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, messageKey);
    
    const cipherPacket = {
      c: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
      n: sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
      messageNumber: ratchetState.sendMessageNumber,
      previousChainLength: ratchetState.previousSendingChainLength
    };
    
    const newRatchetState: RatchetState = {
      ...ratchetState,
      sendingChainKey: nextChainKey,
      sendMessageNumber: ratchetState.sendMessageNumber + 1
    };
    
    this.zeroizeKey(messageKey);
    
    const rotatedState = await this.rotateKeys(newRatchetState);
    
    return { cipherPacket, newRatchetState: rotatedState };
  }

  static async decryptWithPFS(
    cipherPacket: any,
    ratchetState: RatchetState
  ): Promise<{ message: string; newRatchetState: RatchetState }> {
    await sodium.ready;
    
    const messageNumber = cipherPacket.messageNumber || 0;
    const expectedNumber = ratchetState.receiveMessageNumber;
    
    if (messageNumber < expectedNumber) {
      const skippedKey = ratchetState.skippedKeys.get(messageNumber);
      if (!skippedKey) {
        throw new Error('Message key not found for out-of-order message');
      }
      
      const message = await this.decryptMessage(cipherPacket, skippedKey);
      ratchetState.skippedKeys.delete(messageNumber);
      
      return { message, newRatchetState: ratchetState };
    }
    
    let currentChainKey = ratchetState.receivingChainKey;
    let currentMessageNumber = ratchetState.receiveMessageNumber;
    
    while (currentMessageNumber < messageNumber) {
      const { messageKey, nextChainKey } = await this.deriveMessageKeys(currentChainKey);
      
      if (currentMessageNumber < messageNumber) {
        ratchetState.skippedKeys.set(currentMessageNumber, messageKey);
      }
      
      currentChainKey = nextChainKey;
      currentMessageNumber++;
    }
    
    const { messageKey, nextChainKey } = await this.deriveMessageKeys(currentChainKey);
    const message = await this.decryptMessage(cipherPacket, messageKey);
    
    const newRatchetState: RatchetState = {
      ...ratchetState,
      receivingChainKey: nextChainKey,
      receiveMessageNumber: currentMessageNumber + 1
    };
    
    this.zeroizeKey(messageKey);
    
    return { message, newRatchetState };
  }

  private static async decryptMessage(cipherPacket: any, messageKey: Uint8Array): Promise<string> {
    const ciphertext = sodium.from_base64(cipherPacket.c, sodium.base64_variants.URLSAFE_NO_PADDING);
    const nonce = sodium.from_base64(cipherPacket.n, sodium.base64_variants.URLSAFE_NO_PADDING);
    
    const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, messageKey);
    return sodium.to_string(decryptedBytes);
  }

  static cleanupOldKeys(ratchetState: RatchetState, maxAge: number = 50): RatchetState {
    const currentNumber = ratchetState.receiveMessageNumber;
    const cutoff = currentNumber - maxAge;
    
    for (const [messageNumber] of ratchetState.skippedKeys) {
      if (messageNumber < cutoff) {
        const key = ratchetState.skippedKeys.get(messageNumber);
        if (key) {
          this.zeroizeKey(key);
          ratchetState.skippedKeys.delete(messageNumber);
        }
      }
    }
    
    return ratchetState;
  }

  static zeroizeKey(key: Uint8Array): void {
    if (key && key.length > 0) {
      key.fill(0);
    }
  }

  static zeroizeRatchetState(ratchetState: RatchetState): void {
    this.zeroizeKey(ratchetState.rootKey);
    this.zeroizeKey(ratchetState.sendingChainKey);
    this.zeroizeKey(ratchetState.receivingChainKey);
    
    for (const [, key] of ratchetState.skippedKeys) {
      this.zeroizeKey(key);
    }
    ratchetState.skippedKeys.clear();
  }
}