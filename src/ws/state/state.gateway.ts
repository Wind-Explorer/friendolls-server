import { Logger, Inject, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import type { Server } from 'socket.io';
import {
  REDIS_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from '../../database/redis.module';
import type { AuthenticatedSocket } from '../../types/socket';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';
import { CursorPositionDto } from '../dto/cursor-position.dto';
import { UserStatusDto } from '../dto/user-status.dto';
import { SendInteractionDto } from '../dto/send-interaction.dto';
import { PrismaService } from '../../database/prisma.service';
import { UserSocketService } from './user-socket.service';
import { WsNotificationService } from './ws-notification.service';
import { WS_EVENT, REDIS_CHANNEL } from './ws-events';
import { ConnectionHandler } from './connection/handler';
import { CursorHandler } from './cursor/handler';
import { StatusHandler } from './status/handler';
import { InteractionHandler } from './interaction/handler';
import { RedisHandler } from './utils/redis-handler';
import { Broadcaster } from './utils/broadcasting';
import { Throttler } from './utils/throttling';

@WebSocketGateway()
export class StateGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(StateGateway.name);

  @WebSocketServer() io: Server;

  private readonly throttler = new Throttler();
  private readonly broadcaster: Broadcaster;
  private readonly redisHandler: RedisHandler;
  private readonly connectionHandler: ConnectionHandler;
  private readonly cursorHandler: CursorHandler;
  private readonly statusHandler: StatusHandler;
  private readonly interactionHandler: InteractionHandler;

  constructor(
    private readonly jwtVerificationService: JwtVerificationService,
    private readonly prisma: PrismaService,
    private readonly userSocketService: UserSocketService,
    private readonly wsNotificationService: WsNotificationService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
    @Inject(REDIS_SUBSCRIBER_CLIENT)
    private readonly redisSubscriber: Redis | null,
  ) {
    this.broadcaster = new Broadcaster(
      this.userSocketService,
      this.wsNotificationService,
    );
    this.redisHandler = new RedisHandler(this.wsNotificationService);
    this.connectionHandler = new ConnectionHandler(
      this.jwtVerificationService,
      this.prisma,
      this.userSocketService,
      this.wsNotificationService,
      this.logger,
    );
    this.cursorHandler = new CursorHandler(this.broadcaster, this.throttler);
    this.statusHandler = new StatusHandler(this.broadcaster, this.throttler);
    this.interactionHandler = new InteractionHandler(
      this.prisma,
      this.userSocketService,
      this.wsNotificationService,
    );

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
          this.redisHandler.handleActiveDollUpdateMessage(message);
        } else if (channel === REDIS_CHANNEL.FRIEND_CACHE_UPDATE) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.redisHandler.handleFriendCacheUpdateMessage(message);
        }
      });
    }
  }

  afterInit() {
    this.logger.log('Initialized');
    this.wsNotificationService.setIo(this.io);
  }

  handleConnection(client: AuthenticatedSocket) {
    this.connectionHandler.handleConnection(client);
  }

  @SubscribeMessage(WS_EVENT.CLIENT_INITIALIZE)
  async handleClientInitialize(client: AuthenticatedSocket) {
    await this.connectionHandler.handleClientInitialize(client);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    await this.connectionHandler.handleDisconnect(client);
    // Remove from throttler
    const userId = client.data.userId;
    if (userId) {
      this.throttler.remove(userId);
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return this.userSocketService.isUserOnline(userId);
  }

  @SubscribeMessage(WS_EVENT.CURSOR_REPORT_POSITION)
  async handleCursorReportPosition(
    client: AuthenticatedSocket,
    data: CursorPositionDto,
  ) {
    await this.cursorHandler.handleCursorReportPosition(client, data);
  }

  @SubscribeMessage(WS_EVENT.CLIENT_REPORT_USER_STATUS)
  async handleClientReportUserStatus(
    client: AuthenticatedSocket,
    data: UserStatusDto,
  ) {
    await this.statusHandler.handleClientReportUserStatus(client, data);
  }

  async handleSendInteraction(
    client: AuthenticatedSocket,
    data: SendInteractionDto,
  ) {
    await this.interactionHandler.handleSendInteraction(client, data);
  }

  onModuleDestroy() {
    if (this.redisSubscriber) {
      this.redisSubscriber.removeAllListeners('message');
    }
  }
}
