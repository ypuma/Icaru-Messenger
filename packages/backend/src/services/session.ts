import jwt from 'jsonwebtoken';
import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import prisma from '@/db';

export interface SessionData {
  userId: string;
  deviceId: string;
  sessionId: string;
}

export class SessionService {
  /**
   * Create a new session for a user
   */
  async createSession(
    userId: string,
    deviceId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; session: any }> {
    try {
      // Create session in database
      const session = await prisma.session.create({
        data: {
          userId,
          deviceId,
          sessionToken: '', // Will be updated with JWT
          expiresAt: new Date(Date.now() + config.SESSION_TIMEOUT),
          ipAddress,
          userAgent,
        }
      });

      // Create JWT token
      const tokenPayload: SessionData = {
        userId,
        deviceId,
        sessionId: session.id,
      };

      const token = jwt.sign(tokenPayload, config.JWT_SECRET);

      // Update session with token
      const updatedSession = await prisma.session.update({
        where: { id: session.id },
        data: { sessionToken: token }
      });

      logger.info(`Session created for user ${userId}, device ${deviceId}`);

      return {
        token,
        session: updatedSession,
      };

    } catch (error) {
      logger.error('Failed to create session:', error);
      throw new Error('Session creation failed');
    }
  }

  /**
   * Validate and refresh a session
   */
  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await prisma.session.findUnique({
        where: {
          id: sessionId,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!session) {
        return false;
      }

      // Update last activity
      await prisma.session.update({
        where: { id: sessionId },
        data: { lastActivity: new Date() }
      });

      return true;

    } catch (error) {
      logger.error('Session validation failed:', error);
      return false;
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      await prisma.session.delete({
        where: { id: sessionId }
      });

      logger.info(`Session ${sessionId} ended`);

    } catch (error) {
      logger.error('Failed to end session:', error);
      throw new Error('Session termination failed');
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired sessions`);
      }

      return result.count;

    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<any[]> {
    try {
      const sessions = await prisma.session.findMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date()
          }
        },
        select: {
          id: true,
          deviceId: true,
          lastActivity: true,
          createdAt: true,
          ipAddress: true,
          userAgent: true,
        },
        orderBy: { lastActivity: 'desc' }
      });

      return sessions;

    } catch (error) {
      logger.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Terminate all sessions for a user (useful for security)
   */
  async terminateAllUserSessions(userId: string): Promise<number> {
    try {
      const result = await prisma.session.deleteMany({
        where: { userId }
      });

      logger.info(`Terminated ${result.count} sessions for user ${userId}`);
      return result.count;

    } catch (error) {
      logger.error('Failed to terminate user sessions:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const sessionService = new SessionService(); 