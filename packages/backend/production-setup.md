# Production Deployment Guide

## Prerequisites

1. **Domain Name**: Purchase a domain for your application
2. **SSL Certificate**: Use Let's Encrypt (free) or purchased SSL
3. **Database**: PostgreSQL recommended for production (instead of SQLite)

## Environment Variables (Required)

Create a `.env` file with these variables:

```bash
# REQUIRED - Change these in production!
NODE_ENV=production
JWT_SECRET="your-super-secure-32-character-minimum-secret-key"
CORS_ORIGIN="https://your-frontend-domain.com"

# Server Configuration
PORT=11401
HOST=0.0.0.0

# Database (PostgreSQL recommended)
DATABASE_URL="postgresql://username:password@host:port/database"

# Security
DISABLE_RATE_LIMIT=false
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000
```

## Database Migration to PostgreSQL

1. **Install PostgreSQL** on your server or use a managed service
2. **Update DATABASE_URL** in your .env file
3. **Run migrations**:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

## Security Checklist

- [ ] Change JWT_SECRET to a secure random string
- [ ] Set CORS_ORIGIN to your actual frontend domain
- [ ] Enable HTTPS/SSL
- [ ] Set up firewall rules
- [ ] Enable rate limiting
- [ ] Use strong database passwords
- [ ] Regular security updates

## Monitoring

- [ ] Set up server monitoring (PM2 monitoring, New Relic, etc.)
- [ ] Configure log rotation
- [ ] Set up backup strategy for database
- [ ] Monitor disk space and memory usage

## Backup Strategy

```bash
# Database backup (PostgreSQL)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > $BACKUP_DIR/backup_$DATE.sql
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
```

## Performance Optimization

- [ ] Use a reverse proxy (Nginx/Apache)
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets
- [ ] Database connection pooling
- [ ] Caching strategy (Redis if needed) 