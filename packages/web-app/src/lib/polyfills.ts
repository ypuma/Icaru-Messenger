// Polyfills for browser compatibility and Node.js modules

// Buffer polyfill for browser environment
import { Buffer } from 'buffer';
if (typeof globalThis !== 'undefined') {
  globalThis.Buffer = Buffer;
} else if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}

// Process polyfill with all necessary properties including EventEmitter methods
const processPolyfill = {
  env: { NODE_ENV: 'production' },
  versions: { node: '18.0.0' },
  platform: 'browser',
  arch: 'browser',
  argv: ['browser', 'browser'], // Fix for libsodium process.argv error
  nextTick: (callback: Function) => setTimeout(callback, 0),
  cwd: () => '/',
  exit: () => {},
  pid: 1,
  browser: true,
  // EventEmitter methods that Signal Protocol might expect
  on: (event: string, listener: Function) => {},
  off: (event: string, listener: Function) => {},
  emit: (event: string, ...args: any[]) => false,
  once: (event: string, listener: Function) => {},
  removeListener: (event: string, listener: Function) => {},
  removeAllListeners: (event?: string) => {},
  listeners: (event: string) => [],
  listenerCount: (event: string) => 0,
} as any;

if (typeof globalThis !== 'undefined' && !globalThis.process) {
  globalThis.process = processPolyfill;
} else if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = processPolyfill;
} else {
  // Ensure process.argv exists even if process is already defined
  if (globalThis.process && !Array.isArray(globalThis.process.argv)) {
    globalThis.process.argv = ['browser', 'browser'];
  }
}

// Events polyfill - EventEmitter for browser
import { EventEmitter } from 'events';
if (typeof globalThis !== 'undefined') {
  (globalThis as any).EventEmitter = EventEmitter;
} else if (typeof window !== 'undefined') {
  (window as any).EventEmitter = EventEmitter;
}

// Util polyfills
import util from 'util';

// Add stubs for missing functions
const debuglog = (_section: string) => {
  const log = (..._args: any[]) => {};
  (log as any).enabled = false; // Add required 'enabled' property
  return log as util.DebugLogger;
};
(util as any).debuglog = debuglog;

const inspect = (object: any, options?: any) => {
  // A simplified version of inspect for browser console
  if (typeof object === 'string') return object;
  try {
    return JSON.stringify(object, null, options?.depth || 2);
  } catch {
    return String(object);
  }
};

// Add required properties to the inspect function
(inspect as any).colors = {};
(inspect as any).styles = {};
(inspect as any).defaultOptions = {};
(inspect as any).replDefaults = {};
(inspect as any).custom = Symbol('inspect.custom');

(util as any).inspect = inspect;

if (typeof globalThis !== 'undefined') {
  (globalThis as any).util = util;
} else if (typeof window !== 'undefined') {
  (window as any).util = util;
}

// Path polyfills (basic implementation for browser)
const pathPolyfill = {
  join: (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
  dirname: (filePath: string) => {
    if (!filePath || typeof filePath !== 'string') return '.';
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  },
  basename: (filePath: string, ext?: string) => {
    if (!filePath || typeof filePath !== 'string') return '';
    const name = filePath.split('/').pop() || '';
    if (ext && name.endsWith(ext)) {
      return name.slice(0, -ext.length);
    }
    return name;
  },
  extname: (filePath: string) => {
    if (!filePath || typeof filePath !== 'string') return '';
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.slice(lastDot) : '';
  },
  resolve: (...parts: string[]) => '/' + parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).path = pathPolyfill;
} else if (typeof window !== 'undefined') {
  (window as any).path = pathPolyfill;
}

// OS polyfill
const osPolyfill = {
  arch: () => 'browser',
  platform: () => 'browser',
  type: () => 'Browser',
  release: () => '1.0.0',
  version: () => '#1 Browser',
  hostname: () => 'localhost',
  homedir: () => '/home',
  tmpdir: () => '/tmp',
  endianness: () => 'LE',
  freemem: () => 8589934592,
  totalmem: () => 17179869184,
  cpus: () => [{ model: 'Virtual CPU', speed: 2400, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
  networkInterfaces: () => ({}),
  loadavg: () => [0, 0, 0]
};

if (typeof globalThis !== 'undefined' && !(globalThis as any).os) {
  (globalThis as any).os = osPolyfill;
} else if (typeof window !== 'undefined' && !(window as any).os) {
  (window as any).os = osPolyfill;
}

// FS polyfills (stub implementation to prevent errors)
const fsPolyfill = {
  readFileSync: () => { throw new Error('fs not available in browser'); },
  writeFileSync: () => { throw new Error('fs not available in browser'); },
  existsSync: () => false,
  mkdirSync: () => { throw new Error('fs not available in browser'); },
  readdirSync: () => { throw new Error('fs not available in browser'); },
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).fs = fsPolyfill;
} else if (typeof window !== 'undefined') {
  (window as any).fs = fsPolyfill;
}

// TextEncoder/TextDecoder polyfill for older browsers
if (typeof globalThis !== 'undefined') {
  if (!globalThis.TextEncoder) {
    try {
      const { TextEncoder, TextDecoder } = require('util');
      globalThis.TextEncoder = TextEncoder;
      globalThis.TextDecoder = TextDecoder;
    } catch {
      console.warn('TextEncoder/TextDecoder not available');
    }
  }
} else if (typeof window !== 'undefined') {
  if (!(window as any).TextEncoder) {
    try {
      const { TextEncoder, TextDecoder } = require('util');
      (window as any).TextEncoder = TextEncoder;
      (window as any).TextDecoder = TextDecoder;
    } catch {
      console.warn('TextEncoder/TextDecoder not available');
    }
  }
}

// Crypto polyfill for secure random generation
if (typeof globalThis !== 'undefined' && !globalThis.crypto) {
  try {
    const { webcrypto } = require('crypto');
    globalThis.crypto = webcrypto as any;
  } catch {
    console.warn('WebCrypto not available, using fallback');
  }
}

// Export for explicit imports
export { Buffer };
export const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
export const isBrowser = typeof window !== 'undefined'; 