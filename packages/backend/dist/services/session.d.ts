export interface SessionData {
    userId: string;
    deviceId: string;
    sessionId: string;
}
export declare class SessionService {
    /**
     * Create a new session for a user
     */
    createSession(userId: string, deviceId: string, ipAddress?: string, userAgent?: string): Promise<{
        token: string;
        session: any;
    }>;
    /**
     * Validate and refresh a session
     */
    validateSession(sessionId: string): Promise<boolean>;
    /**
     * End a session
     */
    endSession(sessionId: string): Promise<void>;
    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions(): Promise<number>;
    /**
     * Get active sessions for a user
     */
    getUserSessions(userId: string): Promise<any[]>;
    /**
     * Terminate all sessions for a user (useful for security)
     */
    terminateAllUserSessions(userId: string): Promise<number>;
}
export declare const sessionService: SessionService;
//# sourceMappingURL=session.d.ts.map