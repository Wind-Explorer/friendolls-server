import { Logger, Inject } from '@nestjs/common';
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
import Redis from 'ioredis';
import type { Server } from 'socket.io';
import {
  REDIS_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from '../../database/redis.module';
import type { AuthenticatedSocket } from '../../types/socket';
import { AuthService } from '../../auth/auth.service';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';
import { CursorPositionDto } from '../dto/cursor-position.dto';
import { PrismaService } from '../../database/prisma.service';
import { UserSocketService } from './user-socket.service';

import { FriendEvents } from '../../friends/events/friend.events';

import type {
  FriendRequestReceivedEvent,
  FriendRequestAcceptedEvent,
  FriendRequestDeniedEvent,
  UnfriendedEvent,
} from '../../friends/events/friend.events';

import { DollEvents } from '../../dolls/events/doll.events';
import type {
  DollCreatedEvent,
  DollUpdatedEvent,
  DollDeletedEvent,
} from '../../dolls/events/doll.events';

import { UserEvents } from '../../users/events/user.events';
import type { UserActiveDollChangedEvent } from '../../users/events/user.events';

const WS_EVENT = {
  CLIENT_INITIALIZE: 'client-initialize',
  INITIALIZED: 'initialized',
  CURSOR_REPORT_POSITION: 'cursor-report-position',
  FRIEND_REQUEST_RECEIVED: 'friend-request-received',
  FRIEND_REQUEST_ACCEPTED: 'friend-request-accepted',
  FRIEND_REQUEST_DENIED: 'friend-request-denied',
  UNFRIENDED: 'unfriended',
  FRIEND_CURSOR_POSITION: 'friend-cursor-position',
  FRIEND_DISCONNECTED: 'friend-disconnected',
  FRIEND_DOLL_CREATED: 'friend-doll-created',
  FRIEND_DOLL_UPDATED: 'friend-doll-updated',
  FRIEND_DOLL_DELETED: 'friend-doll-deleted',
  FRIEND_ACTIVE_DOLL_CHANGED: 'friend-active-doll-changed',
} as const;

const REDIS_CHANNEL = {
  ACTIVE_DOLL_UPDATE: 'active-doll-update',
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
  private lastBroadcastMap: Map<string, number> = new Map();

  @WebSocketServer() io: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly jwtVerificationService: JwtVerificationService,
    private readonly prisma: PrismaService,
    private readonly userSocketService: UserSocketService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
    @Inject(REDIS_SUBSCRIBER_CLIENT)
    private readonly redisSubscriber: Redis | null,
  ) {
    // Setup Redis subscription for cross-instance communication
    if (this.redisSubscriber) {
      this.redisSubscriber
        .subscribe(REDIS_CHANNEL.ACTIVE_DOLL_UPDATE, (err) => {
          if (err) {
            this.logger.error(
              `Failed to subscribe to ${REDIS_CHANNEL.ACTIVE_DOLL_UPDATE}`,
              err,
            );
          } else {
            this.logger.log(
              `Subscribed to ${REDIS_CHANNEL.ACTIVE_DOLL_UPDATE} channel`,
            );
          }
        })
        .catch((err) => {
          this.logger.error(
            `Error subscribing to ${REDIS_CHANNEL.ACTIVE_DOLL_UPDATE}`,
            err,
          );
        });

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === REDIS_CHANNEL.ACTIVE_DOLL_UPDATE) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.handleActiveDollUpdateMessage(message);
        }
      });
    }
  }

  afterInit() {
    this.logger.log('Initialized');
  }

  private async handleActiveDollUpdateMessage(message: string) {
    try {
      const data = JSON.parse(message) as {
        userId: string;
        dollId: string | null;
      };
      const { userId, dollId } = data;

      // Check if the user is connected to THIS instance
      // Note: We need a local way to check if we hold the socket connection.
      // io.sockets.sockets is a Map of all connected sockets on this server instance.

      // We first get the socket ID from the shared store (UserSocketService)
      // to see which socket ID belongs to the user.
      const socketId = await this.userSocketService.getSocket(userId);

      if (socketId) {
        // Now check if we actually have this socket locally
        const localSocket = this.io.sockets.sockets.get(socketId);
        if (localSocket) {
          // We own this connection! Update the local state.
          const authSocket = localSocket as AuthenticatedSocket;
          authSocket.data.activeDollId = dollId;
          this.logger.debug(
            `Updated activeDollId locally for user ${userId} to ${dollId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error handling redis message', error);
    }
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

      // Initialize defaults
      client.data.activeDollId = null;
      client.data.friends = new Set();
      // userId is not set yet, it will be set in handleClientInitialize

      this.logger.log(`WebSocket authenticated (Pending Init): ${payload.sub}`);

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

  @SubscribeMessage(WS_EVENT.CLIENT_INITIALIZE)
  async handleClientInitialize(client: AuthenticatedSocket) {
    try {
      let userTokenData = client.data.user;

      if (!userTokenData) {
        this.logger.warn(
          'No user data found during initialization - attempting handshake token verification',
        );

        const token = this.jwtVerificationService.extractToken(
          client.handshake,
        );
        if (!token) {
          throw new WsException('Unauthorized: No user data found');
        }

        const payload = await this.jwtVerificationService.verifyToken(token);
        if (!payload.sub) {
          throw new WsException('Invalid token: missing subject');
        }

        userTokenData = {
          keycloakSub: payload.sub,
          email: payload.email,
          name: payload.name,
          username: payload.preferred_username,
          picture: payload.picture,
        };
        client.data.user = userTokenData;

        // Ensure defaults exist if this path runs on reconnect
        client.data.activeDollId = client.data.activeDollId ?? null;
        client.data.friends = client.data.friends ?? new Set();

        this.logger.log(
          `WebSocket authenticated via initialize fallback (Pending Init): ${payload.sub}`,
        );
      }

      // 1. Sync user from token (DB Write/Read)
      const user = await this.authService.syncUserFromToken(userTokenData);

      // 2. Register socket mapping (Redis Write)
      await this.userSocketService.setSocket(user.id, client.id);
      client.data.userId = user.id;

      // 3. Fetch initial state (DB Read)
      const [userWithDoll, friends] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: user.id },
          select: { activeDollId: true },
        }),
        this.prisma.friendship.findMany({
          where: { userId: user.id },
          select: { friendId: true },
        }),
      ]);

      client.data.activeDollId = userWithDoll?.activeDollId || null;
      client.data.friends = new Set(friends.map((f) => f.friendId));

      this.logger.log(`Client initialized: ${user.id} (${client.id})`);

      // 4. Notify client
      client.emit(WS_EVENT.INITIALIZED, {
        userId: user.id,
        activeDollId: client.data.activeDollId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Initialization error: ${errorMessage}`);
      client.emit('auth-error', { message: errorMessage });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;

    if (user) {
      const userId = client.data.userId;

      if (userId) {
        // Check if this socket is still the active one for the user
        const currentSocketId = await this.userSocketService.getSocket(userId);
        if (currentSocketId === client.id) {
          await this.userSocketService.removeSocket(userId);
          this.lastBroadcastMap.delete(userId);

          // Notify friends that this user has disconnected
          const friends = client.data.friends;
          if (friends) {
            const friendIds = Array.from(friends);
            const friendSockets =
              await this.userSocketService.getFriendsSockets(friendIds);

            for (const { socketId } of friendSockets) {
              this.io.to(socketId).emit(WS_EVENT.FRIEND_DISCONNECTED, {
                userId: userId,
              });
            }
          }
        }
      }
      // If userId is undefined, client never initialized, so no cleanup needed
    }

    this.logger.log(
      `Client id: ${client.id} disconnected (user: ${user?.keycloakSub || 'unknown'})`,
    );
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return this.userSocketService.isUserOnline(userId);
  }

  @SubscribeMessage(WS_EVENT.CURSOR_REPORT_POSITION)
  async handleCursorReportPosition(
    client: AuthenticatedSocket,
    data: CursorPositionDto,
  ) {
    const user = client.data.user;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    const currentUserId = client.data.userId;

    if (!currentUserId) {
      // User has not initialized yet
      return;
    }

    // Do not broadcast cursor position if user has no active doll
    if (!client.data.activeDollId) {
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
      const friendIds = Array.from(friends);
      const friendSockets =
        await this.userSocketService.getFriendsSockets(friendIds);

      for (const { socketId } of friendSockets) {
        const payload = {
          userId: currentUserId,
          position: data,
        };
        this.io.to(socketId).emit(WS_EVENT.FRIEND_CURSOR_POSITION, payload);
      }
    }
  }

  @OnEvent(FriendEvents.REQUEST_RECEIVED)
  async handleFriendRequestReceived(payload: FriendRequestReceivedEvent) {
    const { userId, friendRequest } = payload;
    const socketId = await this.userSocketService.getSocket(userId);
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
  async handleFriendRequestAccepted(payload: FriendRequestAcceptedEvent) {
    const { userId, friendRequest } = payload;

    const socketId = await this.userSocketService.getSocket(userId);

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
    const receiverSocketId = await this.userSocketService.getSocket(
      friendRequest.receiverId,
    );
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
  async handleFriendRequestDenied(payload: FriendRequestDeniedEvent) {
    const { userId, friendRequest } = payload;
    const socketId = await this.userSocketService.getSocket(userId);
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
  async handleUnfriended(payload: UnfriendedEvent) {
    const { userId, friendId } = payload;

    const socketId = await this.userSocketService.getSocket(userId);

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
    const initiatorSocketId = await this.userSocketService.getSocket(friendId);
    if (initiatorSocketId) {
      const initiatorSocket = this.io.sockets.sockets.get(
        initiatorSocketId,
      ) as AuthenticatedSocket;
      if (initiatorSocket && initiatorSocket.data.friends) {
        initiatorSocket.data.friends.delete(userId);
      }
    }
  }

  @OnEvent(DollEvents.DOLL_CREATED)
  async handleDollCreated(payload: DollCreatedEvent) {
    const { userId, doll } = payload;
    const friendSockets = await this.userSocketService.getFriendsSockets([
      userId,
    ]);

    for (const { socketId } of friendSockets) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_DOLL_CREATED, {
        friendId: userId,
        doll: {
          id: doll.id,
          name: doll.name,
          configuration: doll.configuration,
          createdAt: doll.createdAt,
          updatedAt: doll.updatedAt,
        },
      });
    }
  }

  @OnEvent(DollEvents.DOLL_UPDATED)
  async handleDollUpdated(payload: DollUpdatedEvent) {
    const { userId, doll } = payload;
    const friendSockets = await this.userSocketService.getFriendsSockets([
      userId,
    ]);

    for (const { socketId } of friendSockets) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_DOLL_UPDATED, {
        friendId: userId,
        doll: {
          id: doll.id,
          name: doll.name,
          configuration: doll.configuration,
          createdAt: doll.createdAt,
          updatedAt: doll.updatedAt,
        },
      });
    }
  }

  @OnEvent(DollEvents.DOLL_DELETED)
  async handleDollDeleted(payload: DollDeletedEvent) {
    const { userId, dollId } = payload;
    const friendSockets = await this.userSocketService.getFriendsSockets([
      userId,
    ]);

    for (const { socketId } of friendSockets) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_DOLL_DELETED, {
        friendId: userId,
        dollId,
      });
    }
  }

  @OnEvent(UserEvents.ACTIVE_DOLL_CHANGED)
  async handleActiveDollChanged(payload: UserActiveDollChangedEvent) {
    const { userId, dollId, doll } = payload;

    // 1. Publish update to all instances via Redis so they can update local socket state
    if (this.redisClient) {
      await this.redisClient.publish(
        REDIS_CHANNEL.ACTIVE_DOLL_UPDATE,
        JSON.stringify({ userId, dollId }),
      );
    } else {
      // Fallback for single instance (no redis) - update locally directly
      // This mimics what handleActiveDollUpdateMessage does
      const socketId = await this.userSocketService.getSocket(userId);
      if (socketId) {
        const userSocket = this.io.sockets.sockets.get(
          socketId,
        ) as AuthenticatedSocket;
        if (userSocket) {
          userSocket.data.activeDollId = dollId;
        }
      }
    }

    // 2. Broadcast to friends
    const friends = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = friends.map((f) => f.friendId);

    const friendSockets =
      await this.userSocketService.getFriendsSockets(friendIds);

    this.logger.log(
      `Broadcasting friend-active-doll-changed for user ${userId}, doll: ${doll ? doll.id : 'null'} to ${friendSockets.length} friends`,
    );

    for (const { socketId } of friendSockets) {
      this.io.to(socketId).emit(WS_EVENT.FRIEND_ACTIVE_DOLL_CHANGED, {
        friendId: userId,
        doll: doll
          ? {
              id: doll.id,
              name: doll.name,
              configuration: doll.configuration,
              createdAt: doll.createdAt,
              updatedAt: doll.updatedAt,
            }
          : null,
      });
    }
  }
}
