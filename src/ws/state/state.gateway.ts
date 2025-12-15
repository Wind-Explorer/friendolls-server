import { Logger, Inject, forwardRef } from '@nestjs/common';
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
import {
  FriendRequestWithRelations,
  FriendsService,
} from '../../friends/friends.service';

const WS_EVENT = {
  CURSOR_REPORT_POSITION: 'cursor-report-position',
  FRIEND_REQUEST_RECEIVED: 'friend-request-received',
  FRIEND_REQUEST_ACCEPTED: 'friend-request-accepted',
  FRIEND_REQUEST_DENIED: 'friend-request-denied',
  UNFRIENDED: 'unfriended',
  FRIEND_CURSOR_POSITION: 'friend-cursor-position',
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
    @Inject(forwardRef(() => FriendsService))
    private readonly friendsService: FriendsService,
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

      // Initialize friends cache
      const friends = await this.friendsService.getFriends(user.id);
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

    // Get the user ID from the userSocketMap (keycloakSub -> userId map is handled implicitly by connection logic but let's be safe and get it from map iteration or better store userId in client.data)
    // Actually we stored user.id -> client.id in userSocketMap. But we don't have direct access to user.id from client.data.user (it has keycloakSub).
    // Let's improve this by finding the userId. The user is already synced in handleConnection.
    // However, for efficiency, let's reverse lookup or better yet, assume we can get userId.
    // In handleConnection we did: const user = await this.authService.syncUserFromToken(client.data.user); this.userSocketMap.set(user.id, client.id);
    // So we know the user.id is in the map.

    let currentUserId: string | undefined;
    for (const [uid, sid] of this.userSocketMap.entries()) {
      if (sid === client.id) {
        currentUserId = uid;
        break;
      }
    }

    if (!currentUserId) {
      this.logger.warn(`Could not find user ID for client ${client.id}`);
      return;
    }

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
          this.logger.debug(
            `Sending friend cursor position to user ${friendId}: ${JSON.stringify(payload, null, 0)}`,
          );
          this.io
            .to(friendSocketId)
            .emit(WS_EVENT.FRIEND_CURSOR_POSITION, payload);
        }
      }
    }
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
      // Update cache for the user accepting (userId here is the sender of the original request)
      // Wait, in friends.controller: acceptFriendRequest returns the request.
      // emitFriendRequestAccepted is called with friendRequest.senderId (the one who sent the request).
      // The one who accepted is friendRequest.receiverId.

      // We need to update cache for BOTH users if they are online.

      // 1. Update cache for the user who sent the request (userId / friendRequest.senderId)
      const senderSocket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (senderSocket && senderSocket.data.friends) {
        senderSocket.data.friends.add(friendRequest.receiverId);
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
      // Update cache for the user being unfriended (userId)
      // Wait, emitUnfriended is called with (friendId, user.id) in controller.
      // So userId here is the friendId (the one being removed from friend list of the initiator).
      // friendId here is the initiator (user.id).

      // We need to update cache for BOTH users.

      // 1. Update cache for the user receiving the notification (userId)
      const socket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (socket && socket.data.friends) {
        socket.data.friends.delete(friendId);
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

      this.io.to(socketId).emit(WS_EVENT.UNFRIENDED, {
        friendId,
      });
      this.logger.debug(`Emitted unfriended notification to user ${userId}`);
    } else {
      // If the notified user is offline, we still need to update the initiator's cache if they are online
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
}
