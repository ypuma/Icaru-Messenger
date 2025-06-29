import { FastifyInstance } from 'fastify';
interface AuthenticatedSocket {
    userId: string;
    deviceId: string;
    sessionId: string;
    handle: string;
}
interface WebSocketMessage {
    type: 'message' | 'typing' | 'heartbeat' | 'auth';
    data: any;
    timestamp: number;
}
declare class WebSocketManager {
    private connections;
    private userSessions;
    addConnection(userId: string, socket: any, sessionData: AuthenticatedSocket): void;
    removeConnection(userId: string): void;
    getConnection(userId: string): any;
    broadcastToUser(userId: string, message: any): boolean;
    getConnectedUsers(): string[];
    broadcastToContacts(userId: string, message: any): Promise<void>;
    broadcast(message: WebSocketMessage): void;
}
declare const wsManager: WebSocketManager;
export declare function setupWebSocket(fastify: FastifyInstance): void;
export { wsManager };
//# sourceMappingURL=websocket.d.ts.map