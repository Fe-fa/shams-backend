import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class MpesaGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('MpesaGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected for payment tracking: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emits the payment result to a specific room or event name
   * based on the CheckoutRequestID.
   */
  emitPaymentStatus(checkoutRequestId: string, payload: { success: boolean; message: string; receipt?: string }) {
    this.logger.log(`Emitting status for ${checkoutRequestId}: ${payload.success}`);
    this.server.emit(`payment_status_${checkoutRequestId}`, payload);
  }
}