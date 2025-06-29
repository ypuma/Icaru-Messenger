# Secure Messenger - Privacy-Focused Messaging Platform

A secure, privacy-focused messenger built with Signal Protocol encryption, designed for easy migration from web to Electron with enhanced security features.

## 🏗️ Project Structure (Fixed & Optimized)

```
secmes/
├── packages/                    # Monorepo packages structure
│   ├── shared/                 # 🔗 Shared types and interfaces
│   │   ├── src/index.ts       # Platform abstraction interfaces
│   │   ├── package.json       # Shared package configuration
│   │   └── tsconfig.json      # TypeScript configuration
│   │
│   ├── web-app/               # 🌐 Web MVP (Browser-based)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── crypto/signalCrypto.ts    # ✅ Proper Signal Protocol
│   │   │   │   └── storage/browserStorage.ts # ✅ Abstracted storage
│   │   │   └── components/     # React components
│   │   ├── package.json       # ✅ Fixed dependencies
│   │   └── vite.config.ts     # ✅ Updated configuration
│   │
│   ├── backend/               # 🔧 API & WebSocket server
│   │   ├── src/               # Fastify + Prisma backend
│   │   └── package.json       # ✅ Added shared types
│   │
│   └── electron-app/          # 🚀 Future Electron version
│       └── README.md          # Migration strategy & roadmap
│
├── docs/                      # Documentation
│   ├── Features              # Feature specifications
│   ├── PRD                   # Product requirements
│   └── Tasks                 # Development tasks
│
├── package.json              # 🔧 Workspace configuration
└── README.md                 # This file
```

## ✅ Issues Fixed

### 1. **Wrong Crypto Library** (Critical Fix)
- **Before**: Frontend used `@signalapp/libsignal-client` (Node.js only)
- **After**: Uses `@privacyresearch/libsignal-protocol-typescript` (browser-compatible)
- **Impact**: Enables proper Signal Protocol in browsers

### 2. **Platform Abstraction** (Architecture Fix)
- **Before**: No abstraction layers, difficult Electron migration
- **After**: Created `ICryptoProvider`, `IStorageProvider`, `IApiProvider` interfaces
- **Impact**: Clean separation for easy platform migration

### 3. **Project Structure** (Organization Fix)
- **Before**: Monolithic structure, no shared types
- **After**: Monorepo with packages, shared types and interfaces
- **Impact**: Better maintainability and code reuse

### 4. **Storage Architecture** (Implementation Fix)
- **Before**: Mixed storage approaches, no consistency
- **After**: Unified `IStorageProvider` with browser and future Electron implementations
- **Impact**: Consistent data handling across platforms

### 5. **Dependency Management** (Configuration Fix)
- **Before**: Conflicting dependencies, build issues
- **After**: Workspace-based dependency management
- **Impact**: Better dependency resolution and build stability

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm 8+

### Installation
```bash
# Clone and install
cd secmes
npm run install:all

# Build shared package first
npm run build:shared

# Start development
npm run dev
```

### Development Workflow
```bash
# Build everything
npm run build

# Development mode (all packages)
npm run dev

# Individual package development
npm run dev:web      # Frontend only
npm run dev:backend  # Backend only
npm run dev:shared   # Shared types only

# Testing
npm run test

# Linting
npm run lint
```

## 🔄 Electron Migration Path

### Phase 1: Web MVP (Current)
- ✅ Browser-based Signal Protocol
- ✅ IndexedDB storage with abstraction
- ✅ Platform abstraction interfaces
- ✅ Modular architecture

### Phase 2: Electron Migration (Ready)
The architecture is now prepared for easy Electron migration:

```bash
# When ready to migrate:
npm run prepare:electron
npm run electron:init
```

#### Migration Benefits:
1. **Drop-in Crypto Replacement**: `SignalCryptoProvider` → `ElectronCryptoProvider`
2. **Storage Upgrade**: `BrowserStorageProvider` → `ElectronStorageProvider`  
3. **Enhanced Security**: Hardware-backed encryption, memory zeroization
4. **Platform Features**: Biometric auth, system integration

### Platform Comparison

| Feature | Web MVP | Electron |
|---------|---------|----------|
| **Crypto Library** | `@privacyresearch/libsignal-protocol-typescript` | `@signalapp/libsignal-client` |
| **Storage** | IndexedDB | SQLCipher |
| **Memory Protection** | Limited (GC helping) | Native zeroization |
| **Key Storage** | Browser storage | OS Keychain/Vault |
| **Biometrics** | ❌ | ✅ Touch ID, Windows Hello |
| **Hardware Security** | ❌ | ✅ HSM, Secure Enclave |
| **Auto-update** | ❌ | ✅ Code-signed updates |

## 🔐 Security Architecture

### Core Security Features
- **Signal Protocol**: End-to-end encryption with forward secrecy
- **Anonymous Registration**: Handle-based accounts, no personal info
- **Memory Protection**: Automatic key material cleanup
- **Emergency Killswitch**: Complete data destruction
- **Session Management**: Single-device policy with heartbeat

### Browser Security (Current)
- Content Security Policy (CSP)
- SameSite cookies
- Secure IndexedDB scoping
- XSS protection
- Memory cleanup on data destruction

### Electron Security (Planned)
- Hardware-backed key generation
- OS-level secure storage
- Native memory zeroization
- Process isolation
- Anti-debugging protection

## 📱 Platform Abstraction

The new architecture uses clean interfaces for easy platform switching:

```typescript
// Shared interfaces work across all platforms
interface ICryptoProvider {
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  encryptMessage(content: string, recipient: string): Promise<SignalMessage>;
  // ...
}

// Browser implementation
class SignalCryptoProvider implements ICryptoProvider {
  // Uses @privacyresearch/libsignal-protocol-typescript
}

// Future Electron implementation  
class ElectronCryptoProvider implements ICryptoProvider {
  // Uses @signalapp/libsignal-client (native)
}
```

## 🛠️ Development

### Architecture Principles
1. **Platform Agnostic**: Core logic works everywhere
2. **Provider Pattern**: Swappable platform implementations
3. **Shared Types**: Consistent data structures
4. **Security First**: Memory protection and data safety
5. **Migration Ready**: Easy Electron transition

### Adding New Features
1. Define interfaces in `packages/shared/`
2. Implement in platform providers
3. Use abstractions in application code
4. Test across platforms

### Code Quality
- TypeScript strict mode
- ESLint configuration
- Automated testing
- Workspace dependency management

## 📄 License

MIT License - See LICENSE file for details.

---

## 🤝 Contributing

1. Follow the established architecture patterns
2. Use the platform abstraction interfaces
3. Add tests for new features
4. Update documentation

## 🔗 Related Documentation

- [Features](./docs/Features) - Complete feature specifications
- [PRD](./docs/PRD) - Product requirements document  
- [Tasks](./docs/Tasks) - Development task breakdown
- [Electron Migration](./packages/electron-app/README.md) - Detailed migration guide 