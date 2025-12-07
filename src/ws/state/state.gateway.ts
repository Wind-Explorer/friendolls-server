import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';

import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../../types/socket';
import { AuthService } from '../../auth/auth.service';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';
import { CursorPositionDto } from '../dto/cursor-position.dto';
import { FriendRequestWithRelations } from '../../friends/friends.service';

const WS_EVENT = {
  CURSOR_REPORT_POSITION: 'cursor-report-position',
  FRIEND_REQUEST_RECEIVED: 'friend-request-received',
  FRIEND_REQUEST_ACCEPTED: 'friend-request-accepted',
  FRIEND_REQUEST_DENIED: 'friend-request-denied',
  UNFRIENDED: 'unfriended',
} as const;

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class StateGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(StateGateway.name);
  private userSocketMap: Map<string, string> = new Map();

  @WebSocketServer() io: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly jwtVerificationService: JwtVerificationService,
  ) {}

  afterInit() {
    this.logger.log('Initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      this.logger.debug(
        `Connection attempt - handshake auth: ${JSON.stringify(client.handshake.auth)}`,
      );
      this.logger.debug(
        `Connection attempt - handshake headers: ${JSON.stringify(client.handshake.headers)}`,
      );

      const token = this.jwtVerificationService.extractToken(client.handshake);

      if (!token) {
        this.logger.warn('WebSocket connection attempt without token');
        client.disconnect();
        return;
      }

      const payload = await this.jwtVerificationService.verifyToken(token);

      if (!payload.sub) {
        throw new WsException('Invalid token: missing subject');
      }

      client.data.user = {
        keycloakSub: payload.sub,
        email: payload.email,
        name: payload.name,
        username: payload.preferred_username,
        picture: payload.picture,
      };

      this.logger.log(`WebSocket authenticated: ${payload.sub}`);

      const user = await this.authService.syncUserFromToken(client.data.user);
      this.userSocketMap.set(user.id, client.id);

      const { sockets } = this.io.sockets;
      this.logger.log(
        `Client id: ${client.id} connected (user: ${payload.sub})`,
      );
      this.logger.debug(`Number of connected clients: ${sockets.size}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection error: ${errorMessage}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;

    if (user) {
      for (const [userId, socketId] of this.userSocketMap.entries()) {
        if (socketId === client.id) {
          this.userSocketMap.delete(userId);
          break;
        }
      }
    }

    this.logger.log(
      `Client id: ${client.id} disconnected (user: ${user?.keycloakSub || 'unknown'})`,
    );
  }

  @SubscribeMessage(WS_EVENT.CURSOR_REPORT_POSITION)
  handleCursorReportPosition(
    client: AuthenticatedSocket,
    data: CursorPositionDto,
  ) {
    const user = client.data.user;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    this.logger.log(
      `Message received from client id: ${client.id} (user: ${user.keycloakSub})`,
    );
    this.logger.debug(`Payload: ${JSON.stringify(data, null, 0)}`);
  }

  emitFriendRequestReceived(
    userId: string,
    friendRequest: FriendRequestWithRelations,
  ) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_REQUEST_RECEIVED, {
        id: friendRequest.id,
        sender: {
          id: friendRequest.sender.id,
          name: friendRequest.sender.name,
          username: friendRequest.sender.username,
          picture: friendRequest.sender.picture,
        },
        createdAt: friendRequest.createdAt,
      });
      this.logger.debug(
        `Emitted friend request notification to user ${userId}`,
      );
    }
  }

  emitFriendRequestAccepted(
    userId: string,
    friendRequest: FriendRequestWithRelations,
  ) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_REQUEST_ACCEPTED, {
        id: friendRequest.id,
        friend: {
          id: friendRequest.receiver.id,
          name: friendRequest.receiver.name,
          username: friendRequest.receiver.username,
          picture: friendRequest.receiver.picture,
        },
        acceptedAt: friendRequest.updatedAt,
      });
      this.logger.debug(
        `Emitted friend request accepted notification to user ${userId}`,
      );
    }
  }

  emitFriendRequestDenied(
    userId: string,
    friendRequest: FriendRequestWithRelations,
  ) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_REQUEST_DENIED, {
        id: friendRequest.id,
        denier: {
          id: friendRequest.receiver.id,
          name: friendRequest.receiver.name,
          username: friendRequest.receiver.username,
          picture: friendRequest.receiver.picture,
        },
        deniedAt: friendRequest.updatedAt,
      });
      this.logger.debug(
        `Emitted friend request denied notification to user ${userId}`,
      );
    }
  }

  emitUnfriended(userId: string, friendId: string) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(WS_EVENT.UNFRIENDED, {
        friendId,
      });
      this.logger.debug(`Emitted unfriended notification to user ${userId}`);
    }
  }
}
