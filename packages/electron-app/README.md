# Secure Messenger - Electron App

This package will contain the Electron version of the Secure Messenger application.

## Migration Path from Web App

### Phase 1: Current State (Web MVP)
- Browser-based using `@privacyresearch/libsignal-protocol-typescript`
- IndexedDB for storage
- Web Crypto API for cryptographic operations
- Limited memory protection capabilities

### Phase 2: Electron Migration (Planned)

#### 1. Enhanced Crypto Provider
Replace browser crypto with native implementation:
```typescript
// packages/electron-app/src/crypto/electronCrypto.ts
export class ElectronCryptoProvider implements ICryptoProvider {
  // Uses @signalapp/libsignal-client (native)
  // Hardware-backed key generation
  // Native memory zeroization
}
```

#### 2. Secure Storage Provider  
Replace IndexedDB with SQLCipher:
```typescript
// packages/electron-app/src/storage/electronStorage.ts
export class ElectronStorageProvider implements IStorageProvider {
  // SQLCipher encrypted database
  // OS-level secure storage (Keychain/Credential Vault)
  // Secure file deletion
}
```

#### 3. Platform Capabilities
```typescript
// packages/electron-app/src/platform/electronPlatform.ts
export const electronPlatform: PlatformInfo = {
  platform: 'electron',
  version: app.getVersion(),
  capabilities: {
    biometric: true,           // Touch ID, Windows Hello
    secureStorage: true,       // OS keychain integration
    memoryZeroization: true,   // Native memory management
    pushNotifications: true    // System notifications
  }
};
```

#### 4. Migration Strategy
1. Copy web-app dist to electron-app/renderer
2. Create main process with IPC security
3. Replace providers with Electron implementations
4. Add biometric authentication
5. Implement hardware killswitch
6. Add auto-updater

## Setup Instructions (Future)

```bash
# When ready to migrate:
npm run prepare:electron
npm run electron:init
cd packages/electron-app

# Install Electron dependencies
npm install @signalapp/libsignal-client sqlite3 better-sqlite3

# Create main process
# Create preload scripts
# Test migration
```

## Security Enhancements (Electron)

### Hardware Integration
- [ ] Hardware-backed key generation
- [ ] Biometric unlock (Touch ID, Windows Hello)  
- [ ] Hardware security module support
- [ ] Secure enclave utilization

### Memory Protection
- [ ] Native memory zeroization
- [ ] Process isolation
- [ ] Secure heap management
- [ ] Anti-debugging protection

### Storage Security
- [ ] SQLCipher integration
- [ ] OS keychain storage
- [ ] Secure file deletion
- [ ] Database encryption at rest

### Platform Features
- [ ] System tray integration
- [ ] Native notifications
- [ ] Auto-updater with signature verification
- [ ] Deep linking support

## File Structure (Planned)
```
packages/electron-app/
├── main/                 # Main process
│   ├── index.ts         # Entry point
│   ├── window.ts        # Window management
│   ├── security.ts      # Security policies
│   └── ipc/            # IPC handlers
├── preload/             # Preload scripts
│   ├── index.ts        # Main preload
│   └── security.ts     # Security bridge
├── renderer/            # Web app build output
├── native/              # Native modules
│   ├── crypto/         # Native crypto operations
│   └── storage/        # Native storage
└── dist/               # Built application
``` 