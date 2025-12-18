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
import { OnEvent } from '@nestjs/event-emitter';

import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../../types/socket';
import { AuthService } from '../../auth/auth.service';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';
import { CursorPositionDto } from '../dto/cursor-position.dto';
import { PrismaService } from '../../database/prisma.service';

import { FriendEvents } from '../../friends/events/friend.events';
import type {
  FriendRequestReceivedEvent,
  FriendRequestAcceptedEvent,
  FriendRequestDeniedEvent,
  UnfriendedEvent,
} from '../../friends/events/friend.events';

const WS_EVENT = {
  CURSOR_REPORT_POSITION: 'cursor-report-position',
  FRIEND_REQUEST_RECEIVED: 'friend-request-received',
  FRIEND_REQUEST_ACCEPTED: 'friend-request-accepted',
  FRIEND_REQUEST_DENIED: 'friend-request-denied',
  UNFRIENDED: 'unfriended',
  FRIEND_CURSOR_POSITION: 'friend-cursor-position',
  FRIEND_DISCONNECTED: 'friend-disconnected',
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
  private lastBroadcastMap: Map<string, number> = new Map();

  @WebSocketServer() io: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly jwtVerificationService: JwtVerificationService,
    private readonly prisma: PrismaService,
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
      client.data.userId = user.id;

      // Initialize friends cache using Prisma directly
      const friends = await this.prisma.friendship.findMany({
        where: { userId: user.id },
        select: { friendId: true },
      });
      client.data.friends = new Set(friends.map((f) => f.friendId));

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
      const userId = client.data.userId;

      if (userId) {
        // Check if this socket is still the active one for the user
        const currentSocketId = this.userSocketMap.get(userId);
        if (currentSocketId === client.id) {
          this.userSocketMap.delete(userId);
          this.lastBroadcastMap.delete(userId);

          // Notify friends that this user has disconnected
          const friends = client.data.friends;
          if (friends) {
            for (const friendId of friends) {
              const friendSocketId = this.userSocketMap.get(friendId);
              if (friendSocketId) {
                this.io.to(friendSocketId).emit(WS_EVENT.FRIEND_DISCONNECTED, {
                  userId: userId,
                });
              }
            }
          }
        }
      } else {
        // Fallback for cases where client.data.userId might not be set
        for (const [uid, socketId] of this.userSocketMap.entries()) {
          if (socketId === client.id) {
            this.userSocketMap.delete(uid);
            this.lastBroadcastMap.delete(uid);
            break;
          }
        }
      }
    }

    this.logger.log(
      `Client id: ${client.id} disconnected (user: ${user?.keycloakSub || 'unknown'})`,
    );
  }

  isUserOnline(userId: string): boolean {
    return this.userSocketMap.has(userId);
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

    const currentUserId = client.data.userId;

    if (!currentUserId) {
      this.logger.warn(`Could not find user ID for client ${client.id}`);
      return;
    }

    const now = Date.now();
    const lastBroadcast = this.lastBroadcastMap.get(currentUserId) || 0;
    if (now - lastBroadcast < 100) {
      return;
    }
    this.lastBroadcastMap.set(currentUserId, now);

    // Broadcast to online friends
    const friends = client.data.friends;
    if (friends) {
      for (const friendId of friends) {
        const friendSocketId = this.userSocketMap.get(friendId);
        if (friendSocketId) {
          const payload = {
            userId: currentUserId,
            position: data,
          };
          this.io
            .to(friendSocketId)
            .emit(WS_EVENT.FRIEND_CURSOR_POSITION, payload);
        }
      }
    }
  }

  @OnEvent(FriendEvents.REQUEST_RECEIVED)
  handleFriendRequestReceived(payload: FriendRequestReceivedEvent) {
    const { userId, friendRequest } = payload;
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

  @OnEvent(FriendEvents.REQUEST_ACCEPTED)
  handleFriendRequestAccepted(payload: FriendRequestAcceptedEvent) {
    const { userId, friendRequest } = payload;

    const socketId = this.userSocketMap.get(userId);

    // 1. Update cache for the user who sent the request (userId / friendRequest.senderId)
    if (socketId) {
      const senderSocket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (senderSocket && senderSocket.data.friends) {
        senderSocket.data.friends.add(friendRequest.receiverId);
      }

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

    // 2. Update cache for the user who accepted the request (friendRequest.receiverId)
    const receiverSocketId = this.userSocketMap.get(friendRequest.receiverId);
    if (receiverSocketId) {
      const receiverSocket = this.io.sockets.sockets.get(
        receiverSocketId,
      ) as AuthenticatedSocket;
      if (receiverSocket && receiverSocket.data.friends) {
        receiverSocket.data.friends.add(friendRequest.senderId);
      }
    }
  }

  @OnEvent(FriendEvents.REQUEST_DENIED)
  handleFriendRequestDenied(payload: FriendRequestDeniedEvent) {
    const { userId, friendRequest } = payload;
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

  @OnEvent(FriendEvents.UNFRIENDED)
  handleUnfriended(payload: UnfriendedEvent) {
    const { userId, friendId } = payload;

    const socketId = this.userSocketMap.get(userId);

    // 1. Update cache for the user receiving the notification (userId)
    if (socketId) {
      const socket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (socket && socket.data.friends) {
        socket.data.friends.delete(friendId);
      }

      this.io.to(socketId).emit(WS_EVENT.UNFRIENDED, {
        friendId,
      });
      this.logger.debug(`Emitted unfriended notification to user ${userId}`);
    }

    // 2. Update cache for the user initiating the unfriend (friendId)
    const initiatorSocketId = this.userSocketMap.get(friendId);
    if (initiatorSocketId) {
      const initiatorSocket = this.io.sockets.sockets.get(
        initiatorSocketId,
      ) as AuthenticatedSocket;
      if (initiatorSocket && initiatorSocket.data.friends) {
        initiatorSocket.data.friends.delete(userId);
      }
    }
  }
}
