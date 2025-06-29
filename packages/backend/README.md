# Secure Messenger Backend API

A secure, end-to-end encrypted messaging backend built with Fastify, TypeScript, and Prisma.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- SQLite (included)

### Installation
```bash
cd secure-messenger/backend
npm install
npx prisma generate
npx prisma migrate dev --name init
```

### Development
```bash
npm run dev
```

The server will start at `http://0.0.0.0:11401`

### Production
```bash
npm run build
npm start
```

## 📋 API Documentation

### Health Check
- **GET** `/health` - Server health status and database connectivity

### Authentication & Accounts

#### Create Account
- **POST** `/api/accounts`
- Creates a new user account
- **Body:**
  ```json
  {
    "handle": "username",
    "formattedHandle": "user-name",
    "publicKey": "base64-encoded-public-key",
    "qrCodeData": "qr-code-data",
    "timestamp": 1234567890
  }
  ```

#### Get Account
- **GET** `/api/accounts?handle=username`
- Retrieves user information by handle

#### Check Handle Availability
- **GET** `/api/accounts/check-handle?handle=username`
- Checks if a handle is available

#### Get Profile (Protected)
- **GET** `/api/accounts/profile`
- Requires: `Authorization: Bearer <token>`
- Returns current user profile

### Contact Management (All Protected)

#### Add Contact
- **POST** `/api/contacts`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "contactHandle": "friend_username",
    "nickname": "My Friend" // optional
  }
  ```

#### Get Contacts
- **GET** `/api/contacts`
- **Headers:** `Authorization: Bearer <token>`
- Returns list of user contacts

#### Update Contact
- **PUT** `/api/contacts`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "contactId": "contact-id",
    "nickname": "New Nickname", // optional
    "isBlocked": false // optional
  }
  ```

#### Delete Contact
- **DELETE** `/api/contacts/:contactId`
- **Headers:** `Authorization: Bearer <token>`

### Messaging (All Protected)

#### Send Message
- **POST** `/api/messages`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "receiverHandle": "recipient_username",
    "content": "Hello, world!",
    "messageType": "TEXT", // TEXT, IMAGE, FILE, VOICE, VIDEO, SYSTEM
    "replyToId": "message-id", // optional
    "metadata": "encrypted-metadata" // optional
  }
  ```

#### Get Messages
- **GET** `/api/messages?contactHandle=username&limit=50&offset=0`
- **Headers:** `Authorization: Bearer <token>`
- Returns conversation with specified contact

#### Mark Message Delivered
- **PATCH** `/api/messages/:messageId/delivered`
- **Headers:** `Authorization: Bearer <token>`

### WebSocket
- **WS** `/ws` - Real-time messaging (echo server for now)

## 🏗️ Architecture

### Directory Structure
```
src/
├── auth/                 # Authentication logic
│   ├── handlers/         # Auth route handlers
│   ├── session/          # Session management
│   ├── recovery/         # Account recovery
│   └── validation/       # Input validation
├── messaging/            # Message handling
│   ├── handlers/         # Message route handlers
│   ├── encryption/       # E2E encryption
│   └── delivery/         # Message delivery
├── contacts/             # Contact management
│   ├── handlers/         # Contact route handlers
│   ├── discovery/        # Contact discovery
│   └── verification/     # Contact verification
├── security/             # Security features
│   ├── handlers/         # Security endpoints
│   ├── encryption/       # Crypto utilities
│   └── backup/           # Backup management
├── db/                   # Database
│   ├── migrations/       # Prisma migrations
│   └── seeds/           # Database seeds
├── middleware/           # Express middleware
│   ├── auth.ts          # JWT authentication
│   ├── validation.ts    # Request validation
│   └── rateLimit.ts     # Rate limiting
├── services/            # Business logic
│   ├── auth.ts          # Auth service
│   ├── messaging.ts     # Message service
│   ├── contacts.ts      # Contact service
│   └── session.ts       # Session service
└── utils/               # Utilities
    ├── config.ts        # Configuration
    ├── logger.ts        # Logging
    ├── crypto.ts        # Cryptography
    └── validation.ts    # Validation helpers
```

### Database Schema

#### Users
- Stores user accounts with handles and public keys
- One-to-many with devices, messages, contacts, sessions

#### Devices
- Manages user devices for multi-device support
- Stores Signal Protocol keys and registration data

#### Messages
- End-to-end encrypted message storage
- Support for different message types and replies
- Delivery and read receipts

#### Contacts
- User contact relationships
- Contact verification and blocking

#### Sessions
- JWT session management
- Device tracking and activity monitoring

#### Recovery Backups
- Encrypted account backup data
- Version control for backup recovery

## 🔐 Security Features

### Authentication
- JWT-based session management
- Secure token validation
- Session expiration and cleanup

### Rate Limiting
- Configurable request limits
- Per-endpoint rate limiting
- Automatic cleanup of rate limit entries

### Input Validation
- Zod schema validation
- SQL injection prevention
- XSS protection via helmet

### Encryption Support
- Database ready for encrypted message content
- Signal Protocol key storage
- Recovery backup encryption

## 🛠️ Configuration

Environment variables (see `src/utils/config.ts`):

```bash
# Server
PORT=11401
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL="file:./dev.db"

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://0.0.0.0:11402

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# Session
SESSION_TIMEOUT=86400000

# Logging
LOG_LEVEL=debug
```

## 🧪 Testing

```bash
# Run tests
npm test

# Test with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Example API Calls

```bash
# Health check
curl http://0.0.0.0:11401/health

# Create account
curl -X POST http://0.0.0.0:11401/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle":"testuser","formattedHandle":"test-user","publicKey":"abc123","qrCodeData":"test","timestamp":1234567890}'

# Get account
curl "http://0.0.0.0:11401/api/accounts?handle=testuser"

# Check handle availability  
curl "http://0.0.0.0:11401/api/accounts/check-handle?handle=newuser"
```

## 🚀 Deployment

### Production Setup
1. Set environment variables
2. Run database migrations
3. Build the application
4. Start with process manager

```bash
# Build
npm run build

# Database
npx prisma migrate deploy

# Start
npm start
```

### Docker Support (Coming Soon)
- Dockerfile for containerization
- Docker Compose for development
- Production-ready container setup

## 📈 Monitoring

- Structured logging with configurable levels
- Health check endpoint for uptime monitoring
- Session and database activity tracking
- Graceful shutdown handling

## 🔄 API Status

### ✅ Implemented
- Account creation and management
- Contact management
- Basic messaging
- Session management
- Health monitoring
- Rate limiting
- Input validation

### 🚧 In Progress
- Signal Protocol integration
- Real-time WebSocket messaging
- File upload support
- Recovery system APIs

### 📋 Planned
- Push notifications
- Media message support
- Message search
- Backup/restore APIs
- Admin endpoints

## 🤝 Contributing

1. Follow TypeScript best practices
2. Add proper error handling
3. Include input validation
4. Write tests for new features
5. Update documentation 