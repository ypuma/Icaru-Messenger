import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

// Import polyfills first
import './lib/polyfills'

// Import PFS test for browser testing
import './test-pfs-browser'

// Make Buffer available globally for libraries like bip39
import { Buffer } from 'buffer'
(globalThis as any).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
