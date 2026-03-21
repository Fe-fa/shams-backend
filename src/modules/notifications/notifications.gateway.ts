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
    } catch {
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

  // ─── Emit to specific user ───────────────────────────────────────────────
  sendToUser(userId: number, event: string, data: unknown) {
    this.server.to(`user-${userId}`).emit(event, data);
  }

  // ─── Broadcast notification to user ──────────────────────────────────────
  sendNotification(userId: number, notification: unknown) {
    this.sendToUser(userId, 'notification', notification);
  }

  // ─── Online check ────────────────────────────────────────────────────────
  isUserOnline(userId: number): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }
}