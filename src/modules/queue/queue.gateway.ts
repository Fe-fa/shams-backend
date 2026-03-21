import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinQueue')
  handleJoinQueue(client: Socket, department: string) {
    client.join(`queue:${department}`);
    return { event: 'joined', data: { department } };
  }

  @SubscribeMessage('leaveQueue')
  handleLeaveQueue(client: Socket, department: string) {
    client.leave(`queue:${department}`);
    return { event: 'left', data: { department } };
  }

  emitQueueUpdate(department: string, data: any) {
    this.server.to(`queue:${department}`).emit('queueUpdate', data);
  }

  emitPatientCalled(department: string, patientData: any) {
    this.server.to(`queue:${department}`).emit('patientCalled', patientData);
  }
}
