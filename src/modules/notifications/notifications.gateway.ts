/**
 * notifications.gateway.ts
 *
 * WebSocket gateway for real-time notifications.
 * Handles:
 * - JWT-based authentication on connection
 * - Per-user socket rooms (supports multi-tab)
 * - Broadcasting notifications to specific users
 * - Emits 'notification' event for new notifications (matches frontend listener)
 * - Emits 'notification:unread-count' for count sync
 * - Emits 'notification:read' and 'notification:all-read' for read state sync
 * - Online status tracking
 */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('NotificationsGateway');

  // Map: userId → Set of socketIds  (user may have multiple tabs)
  private userSockets = new Map<number, Set<string>>();

  constructor(private jwtService: JwtService) {}

  afterInit() {
    this.logger.log('🔌 NotificationsGateway initialised');
  }

  // ─── On connect ─────────────────────────────────────────────────────────
  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection rejected: no token provided (socket ${client.id})`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId: number = payload.sub ?? payload.id;

      client.data.userId = userId;

      // Join personal room
      const room = `user-${userId}`;
      client.join(room);

      // Track sockets per user
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(`✅ User ${userId} connected (socket ${client.id})`);
      client.emit('connected', { message: 'Connected to notification service' });
    } catch (err) {
      this.logger.warn(`Connection rejected: invalid token (socket ${client.id})`);
      client.disconnect();
    }
  }

  // ─── On disconnect ───────────────────────────────────────────────────────
  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as number | undefined;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
      this.logger.log(`❌ User ${userId} disconnected (socket ${client.id})`);
    }
  }

  // ─── Emit to specific user (generic) ─────────────────────────────────────
  sendToUser(userId: number, event: string, data: unknown) {
    this.server.to(`user-${userId}`).emit(event, data);
  }

  // ─── Broadcast new notification to user ──────────────────────────────────
  // Emits on 'notification' — this is what the frontend socket listeners expect
  sendNotification(userId: number, notification: unknown) {
    this.sendToUser(userId, 'notification', notification);
    this.logger.log(`📨 Notification sent to user ${userId}`);
  }

  // ─── Emit unread count sync ──────────────────────────────────────────────
  sendUnreadCount(userId: number, count: number) {
    this.sendToUser(userId, 'notification:unread-count', { count });
  }

  // ─── Emit single read ────────────────────────────────────────────────────
  sendNotificationRead(userId: number, notificationId: number) {
    this.sendToUser(userId, 'notification:read', { id: notificationId });
  }

  // ─── Emit all-read ───────────────────────────────────────────────────────
  sendAllNotificationsRead(userId: number) {
    this.sendToUser(userId, 'notification:all-read', {});
  }

  // ─── Online check ────────────────────────────────────────────────────────
  isUserOnline(userId: number): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  // ─── Get online user count ────────────────────────────────────────────────
  getOnlineUserCount(): number {
    return this.userSockets.size;
  }
}