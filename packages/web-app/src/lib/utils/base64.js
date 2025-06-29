// Shim file for Node-based tests – allows importing "../utils/base64" from
// ESM without the `.ts` extension (Node does not resolve .ts by default).
import { toB64, fromB64 } from './base64.ts';
export { toB64, fromB64 }; 