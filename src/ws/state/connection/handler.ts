import { Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { AuthenticatedSocket } from '../../../types/socket';
import { JwtVerificationService } from '../../../auth/services/jwt-verification.service';
import { PrismaService } from '../../../database/prisma.service';
import { UserSocketService } from '../user-socket.service';
import { WsNotificationService } from '../ws-notification.service';
import { WS_EVENT } from '../ws-events';
import { UsersService } from '../../../users/users.service';

export class ConnectionHandler {
  constructor(
    private readonly jwtVerificationService: JwtVerificationService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly userSocketService: UserSocketService,
    private readonly wsNotificationService: WsNotificationService,
    private readonly logger: Logger,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.jwtVerificationService.extractToken(client.handshake);
      if (!token) {
        this.logger.warn('WebSocket connection attempt without token');
        client.disconnect();
        return;
      }

      const payload = this.jwtVerificationService.verifyToken(token);

      if (!payload.sub) {
        throw new WsException('Invalid token: missing subject');
      }

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };

      // Initialize defaults
      client.data.activeDollId = null;
      client.data.friends = new Set();
      // userId is not set yet, it will be set in handleClientInitialize

      this.logger.log(`WebSocket authenticated (Pending Init): ${payload.sub}`);

      this.logger.log(
        `Client id: ${client.id} connected (user: ${payload.sub})`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection error: ${errorMessage}`);
      client.disconnect();
    }
  }

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

        const payload = this.jwtVerificationService.verifyToken(token);
        if (!payload.sub) {
          throw new WsException('Invalid token: missing subject');
        }

        userTokenData = {
          userId: payload.sub,
          email: payload.email,
          roles: payload.roles,
        };
        client.data.user = userTokenData;

        // Ensure defaults exist if this path runs on reconnect
        client.data.activeDollId = client.data.activeDollId ?? null;
        client.data.friends = client.data.friends ?? new Set();

        this.logger.log(
          `WebSocket authenticated via initialize fallback (Pending Init): ${payload.sub}`,
        );

        this.logger.log(
          `WebSocket authenticated via initialize fallback (Pending Init): ${payload.sub}`,
        );
      }

      const user = await this.usersService.findOne(userTokenData.userId);

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
          // Note: throttling remove is done in gateway

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
      `Client id: ${client.id} disconnected (user: ${user?.userId || 'unknown'})`,
    );

    this.logger.log(
      `Client id: ${client.id} disconnected (user: ${user?.userId || 'unknown'})`,
    );
  }
}
