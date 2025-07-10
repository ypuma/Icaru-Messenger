interface Window {
    
}


interface Message {
    id: string;
    content: string;
    messageType: string;
    senderHandle: string;
    timestamp: string;
    delivered?: boolean;
    isOwn: boolean;
    status?: 'pending' | 'sent' | 'delivered';
    encrypted?: boolean;
}

interface KeyPair {
    publicKey: string;
    privateKey: string;
}

interface SignalKeyBundle {
    identityKey: string;
    signedPreKey: {
        keyId: number;
        publicKey: string;
        signature: string;
    };
    oneTimePreKeys: {
        keyId: number;
        publicKey: string;
    }[];
}

interface EncryptedSignalMessage {
    type: number;
    body: string;
    registrationId: number;
}