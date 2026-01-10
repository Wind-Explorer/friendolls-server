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
import { WsNotificationService } from './ws-notification.service';
import { WS_EVENT, REDIS_CHANNEL } from './ws-events';

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
    private readonly wsNotificationService: WsNotificationService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
    @Inject(REDIS_SUBSCRIBER_CLIENT)
    private readonly redisSubscriber: Redis | null,
  ) {
    // Setup Redis subscription for cross-instance communication
    if (this.redisSubscriber) {
      this.redisSubscriber
        .subscribe(
          REDIS_CHANNEL.ACTIVE_DOLL_UPDATE,
          REDIS_CHANNEL.FRIEND_CACHE_UPDATE,
          (err) => {
            if (err) {
              this.logger.error(`Failed to subscribe to Redis channels`, err);
            } else {
              this.logger.log(`Subscribed to Redis channels`);
            }
          },
        )
        .catch((err) => {
          this.logger.error(`Error subscribing to Redis channels`, err);
        });

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === REDIS_CHANNEL.ACTIVE_DOLL_UPDATE) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.handleActiveDollUpdateMessage(message);
        } else if (channel === REDIS_CHANNEL.FRIEND_CACHE_UPDATE) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.handleFriendCacheUpdateMessage(message);
        }
      });
    }
  }

  afterInit() {
    this.logger.log('Initialized');
    this.wsNotificationService.setIo(this.io);
  }

  private async handleActiveDollUpdateMessage(message: string) {
    try {
      const data = JSON.parse(message) as {
        userId: string;
        dollId: string | null;
      };
      const { userId, dollId } = data;
      await this.wsNotificationService.updateActiveDollCache(userId, dollId);
    } catch (error) {
      this.logger.error('Error handling active doll update message', error);
    }
  }

  private async handleFriendCacheUpdateMessage(message: string) {
    try {
      const data = JSON.parse(message) as {
        userId: string;
        friendId: string;
        action: 'add' | 'delete';
      };
      const { userId, friendId, action } = data;
      await this.wsNotificationService.updateFriendsCacheLocal(
        userId,
        friendId,
        action,
      );
    } catch (error) {
      this.logger.error('Error handling friend cache update message', error);
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
              this.wsNotificationService.emitToSocket(
                socketId,
                WS_EVENT.FRIEND_DISCONNECTED,
                {
                  userId: userId,
                },
              );
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
        this.wsNotificationService.emitToSocket(
          socketId,
          WS_EVENT.FRIEND_CURSOR_POSITION,
          payload,
        );
      }
    }
  }
}
