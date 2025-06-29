# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Secure Messenger**, a privacy-focused messaging application built with Signal Protocol encryption. It's architected as a **monorepo** with a planned migration path from web app to Electron desktop app. The codebase emphasizes security, platform abstraction, and end-to-end encryption.

## Development Commands

### Root workspace commands (run from project root):
```bash
# Development
npm run dev                  # Start all services (shared, backend, web-app)
npm run dev:web             # Frontend only
npm run dev:backend         # Backend only
npm run dev:shared          # Shared types only

# Building
npm run build               # Build all packages
npm run build:shared        # Build shared package first (required)
npm run build:web          # Build frontend
npm run build:backend      # Build backend

# Testing
npm run test               # Run all tests (backend Jest + frontend Playwright)
npm run test:backend       # Backend Jest tests only
npm run test:web          # Frontend Playwright e2e tests only

# Individual package testing
cd packages/web-app && npm run test:ui    # Playwright test UI
cd packages/backend && npm run test:watch # Jest watch mode

# Linting
npm run lint               # Lint all packages
npm run lint:web          # Frontend ESLint
npm run lint:backend      # Backend ESLint

# Database operations (backend)
cd packages/backend && npm run db:generate  # Generate Prisma client
cd packages/backend && npm run db:migrate   # Run database migrations
cd packages/backend && npm run db:seed      # Seed database

# Installation
npm run install:all        # Install all package dependencies
```

### Important build order:
Always build `shared` package first as other packages depend on it:
```bash
npm run build:shared
npm run build
```

## Architecture

### Monorepo Structure
```
secmes/
├── packages/
│   ├── shared/           # Platform abstraction interfaces, shared types
│   ├── web-app/         # React frontend (current implementation)
│   ├── backend/         # Fastify API server with WebSocket
│   └── electron-app/    # Future Electron desktop app
```

### Technology Stack

**Frontend (web-app):**
- React 18 + TypeScript + Vite
- TailwindCSS for styling
- Signal Protocol: `@privacyresearch/libsignal-protocol-typescript` (browser-compatible)
- Storage: IndexedDB via `idb` library
- Testing: Playwright for e2e tests

**Backend:**
- Fastify web framework + WebSocket support
- Prisma ORM with SQLite database
- Signal Protocol: `@signalapp/libsignal-client` (Node.js native)
- Authentication: JWT + bcrypt
- Testing: Jest

**Shared:**
- Platform abstraction interfaces (`ICryptoProvider`, `IStorageProvider`, `IApiProvider`)
- Common TypeScript types and error classes

### Platform Abstraction Pattern

The codebase uses a **provider pattern** for platform abstraction:

```typescript
// Shared interfaces work across all platforms
interface ICryptoProvider {
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  encryptMessage(content: string, recipient: string): Promise<SignalMessage>;
}

// Browser implementation (current)
class SignalCryptoProvider implements ICryptoProvider {
  // Uses @privacyresearch/libsignal-protocol-typescript
}

// Future Electron implementation
class ElectronCryptoProvider implements ICryptoProvider {
  // Uses @signalapp/libsignal-client (native performance)
}
```

This pattern enables easy migration from web to Electron by swapping provider implementations.

### Key Security Features
- **Signal Protocol**: End-to-end encryption with forward secrecy
- **Anonymous Registration**: Handle-based accounts, no personal information required
- **Memory Protection**: Automatic cryptographic key material cleanup
- **Emergency Killswitch**: Complete local data destruction capability
- **Single-Device Policy**: Session management with heartbeat validation

## Code Guidelines

### From .cursor/rules/project-ts.mdc:
- Use **early returns** to enhance readability
- **TailwindCSS only** for styling (no inline styles or external CSS)
- **Descriptive naming**: Use semantic variable and function names
- **Event handlers**: Use `handle` prefix (e.g., `handleClick`, `handleSubmit`)
- **Accessibility**: Implement ARIA attributes, tabindex, keyboard handlers
- **TypeScript**: Use `const` for functions, explicitly define types
- **Security first**: Follow security best practices, especially for sensitive data and encryption keys
- **Environment variables**: Use for configuration, never hard-code sensitive information

### File Structure Patterns
- `packages/web-app/src/components/` - React UI components organized by feature
- `packages/web-app/src/lib/crypto/` - Signal Protocol and encryption implementations
- `packages/web-app/src/lib/storage/` - Browser storage abstractions (IndexedDB, localStorage)
- `packages/backend/src/auth/` - Authentication handlers and routes
- `packages/backend/src/messaging/` - Message handling, WebSocket, crypto operations
- `packages/shared/src/` - Platform abstraction interfaces and shared types

## Development Workflow

1. **Always build shared package first**: `npm run build:shared`
2. **Use platform abstractions**: Don't directly import platform-specific libraries in application logic
3. **Follow the provider pattern**: Implement new features through the abstraction interfaces
4. **Test across platforms**: Ensure changes work in both browser and future Electron contexts
5. **Database changes**: Use Prisma migrations for schema updates
6. **Security review**: All crypto-related changes require careful security consideration

## Migration Path to Electron

The architecture is designed for easy Electron migration:
- **Crypto**: Browser `SignalCryptoProvider` → Native `ElectronCryptoProvider`
- **Storage**: `BrowserStorageProvider` → `ElectronStorageProvider` (SQLCipher)
- **Enhanced Security**: Hardware-backed encryption, native memory zeroization
- **Platform Features**: Biometric auth, system integration, auto-updates

## Testing

- **Backend**: Jest unit tests
- **Frontend**: Playwright e2e tests with UI mode available
- **Database**: Test migrations and seeding available
- **Integration**: Full-stack testing with running backend + frontend