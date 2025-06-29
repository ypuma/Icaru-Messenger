import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

interface SessionInfo {
  handle: string;
  token: string;
  sessionId: string;
}

const API = 'https://0.0.0.0:11401/api';

async function createAccount(prefix: string): Promise<SessionInfo> {
  const unique = Date.now().toString().slice(-6);
  const handle = `${prefix}-${unique}`;
  const key = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('base64');

  // Register account
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, publicKey: key })
  });

  // Start session
  const res = await fetch(`${API}/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, deviceId: crypto.randomUUID() })
  });
  const json = await res.json();
  return { handle, token: json.token, sessionId: json.sessionId };
}

function connectWS({ token, sessionId }: SessionInfo): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://0.0.0.0:11401/ws');
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', data: { token, sessionId }, timestamp: Date.now() }));
    });
    ws.once('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth_success') resolve(ws);
      else reject(new Error('Auth failed'));
    });
    ws.on('error', reject);
  });
}

test('messages are isolated between conversations', async () => {
  // spin up three users
  const A = await createAccount('AAA');
  const B = await createAccount('BBB');
  const C = await createAccount('CCC');

  const wsA = await connectWS(A);
  const wsB = await connectWS(B);
  const wsC = await connectWS(C);

  // helper to capture next message of type 'message'
  const waitMsg = (ws: WebSocket): Promise<any> => new Promise((res) => {
    const handler = (data: WebSocket.RawData) => {
      const m = JSON.parse(data.toString());
      if (m.type === 'message') {
        ws.off('message', handler);
        res(m);
      }
    };
    ws.on('message', handler);
  });

  // A -> B send dummy encrypted packet
  const packet = { n: 'AA', c: 'BB' };
  wsA.send(JSON.stringify({
    type: 'message',
    data: {
      receiverHandle: B.handle,
      content: '',
      messageType: 'text',
      tempId: 'tmp-1',
      encrypted: true,
      encryptedData: JSON.stringify(packet)
    },
    timestamp: Date.now()
  }));

  // B should get it
  const receivedByB = await waitMsg(wsB);
  expect(receivedByB.data.senderHandle).toBe(A.handle);

  // C should NOT get anything within 1s
  const gotByC = await Promise.race([
    waitMsg(wsC).then(() => true),
    new Promise<boolean>(r => setTimeout(() => r(false), 1000))
  ]);
  expect(gotByC).toBe(false);

  wsA.close(); wsB.close(); wsC.close();
}); 