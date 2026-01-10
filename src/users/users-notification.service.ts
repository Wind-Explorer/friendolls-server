import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { WsNotificationService } from '../ws/state/ws-notification.service';
import { UserSocketService } from '../ws/state/user-socket.service';
import { WS_EVENT } from '../ws/state/ws-events';
import type { UserActiveDollChangedEvent } from './events/user.events';
import { UserEvents } from './events/user.events';

@Injectable()
export class UsersNotificationService {
  private readonly logger = new Logger(UsersNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wsNotificationService: WsNotificationService,
    private readonly userSocketService: UserSocketService,
  ) {}

  @OnEvent(UserEvents.ACTIVE_DOLL_CHANGED)
  async handleActiveDollChanged(payload: UserActiveDollChangedEvent) {
    const { userId, dollId, doll } = payload;

    // Publish update to all instances via Redis
    await this.wsNotificationService.publishActiveDollUpdate(userId, dollId);

    // Broadcast to friends
    const friends = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = friends.map((f) => f.friendId);

    this.logger.log(
      `Broadcasting friend-active-doll-changed for user ${userId}, doll: ${doll ? doll.id : 'null'} to ${friendIds.length} friends`,
    );

    await this.wsNotificationService.emitToFriends(
      friendIds,
      WS_EVENT.FRIEND_ACTIVE_DOLL_CHANGED,
      {
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
      },
    );
  }
}
