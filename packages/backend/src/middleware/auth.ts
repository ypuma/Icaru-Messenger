import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import prisma from '@/db';

interface JWTPayload {
  userId: string;
  deviceId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      deviceId: string;
      sessionId: string;
    };
  }
}

export const authenticateToken = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Access token required'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    // Check if session exists and is valid
    const session = await prisma.session.findUnique({
      where: {
        id: decoded.sessionId,
        token: token,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    if (!session) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session'
      });
    }

    // Update last heartbeat
    await prisma.session.update({
      where: { id: session.id },
      data: { lastHeartbeat: new Date() }
    });

    // Attach user info to request
    request.user = {
      userId: decoded.userId,
      deviceId: decoded.deviceId,
      sessionId: decoded.sessionId
    };

  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
};

export const optionalAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      // No token provided, but that's okay for optional auth
      return;
    }

    // Try to authenticate, but don't fail if it doesn't work
    await authenticateToken(request, reply);
  } catch (error) {
    // Log but don't fail the request
    logger.debug('Optional auth failed:', error);
  }
}; 