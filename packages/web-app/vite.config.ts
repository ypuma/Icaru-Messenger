import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'; // Import path for alias resolution

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.versions': '{ "node": "18.0.0" }',
    'process.platform': '"browser"',
    'process.arch': '"browser"',
    'process.argv': '["browser", "browser"]',
    '__filename': '""',
    '__dirname': '""',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      stream: 'stream-browserify',
      util: 'util',
      os: 'os-browserify/browser',
      path: 'path-browserify',
      fs: 'memfs',
      events: 'events',
      '@signalapp/libsignal-client': path.resolve(__dirname, 'src/lib/crypto/libsignal-client-stub.ts'),
    },
  },
  optimizeDeps: {
    include: [
      'buffer', 
      'stream-browserify', 
      'util', 
      'events',
      'os-browserify/browser',
      'path-browserify',
      'libsodium-wrappers',
      '@privacyresearch/libsignal-protocol-typescript'
    ],
    exclude: ['@signalapp/libsignal-client'],
  },
  build: {
    commonjsOptions: {
      include: [
        /buffer/, 
        /stream-browserify/, 
        /util/, 
        /events/,
        /os-browserify/, 
        /path-browserify/,
        /libsodium-wrappers/
      ],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: [],
      plugins: []
    },
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    port: 11402,
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: 'https://0.0.0.0:11401',
        changeOrigin: true,
        secure: false,
      },
    },
    allowedHosts: [
      'test.mendes.dev',
      'icaru.systems',
    ]
  }
})
