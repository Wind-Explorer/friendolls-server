import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsNotificationService } from '../ws/state/ws-notification.service';
import { UserSocketService } from '../ws/state/user-socket.service';
import { WS_EVENT } from '../ws/state/ws-events';
import type {
  DollCreatedEvent,
  DollUpdatedEvent,
  DollDeletedEvent,
} from './events/doll.events';
import { DollEvents } from './events/doll.events';

@Injectable()
export class DollsNotificationService {
  private readonly logger = new Logger(DollsNotificationService.name);

  constructor(
    private readonly wsNotificationService: WsNotificationService,
    private readonly userSocketService: UserSocketService,
  ) {}

  @OnEvent(DollEvents.DOLL_CREATED)
  async handleDollCreated(payload: DollCreatedEvent) {
    const { userId, doll } = payload;
    await this.wsNotificationService.emitToFriends(
      [userId],
      WS_EVENT.FRIEND_DOLL_CREATED,
      {
        friendId: userId,
        doll: {
          id: doll.id,
          name: doll.name,
          configuration: doll.configuration,
          createdAt: doll.createdAt,
          updatedAt: doll.updatedAt,
        },
      },
    );
  }

  @OnEvent(DollEvents.DOLL_UPDATED)
  async handleDollUpdated(payload: DollUpdatedEvent) {
    const { userId, doll } = payload;
    await this.wsNotificationService.emitToFriends(
      [userId],
      WS_EVENT.FRIEND_DOLL_UPDATED,
      {
        friendId: userId,
        doll: {
          id: doll.id,
          name: doll.name,
          configuration: doll.configuration,
          createdAt: doll.createdAt,
          updatedAt: doll.updatedAt,
        },
      },
    );
  }

  @OnEvent(DollEvents.DOLL_DELETED)
  async handleDollDeleted(payload: DollDeletedEvent) {
    const { userId, dollId } = payload;
    await this.wsNotificationService.emitToFriends(
      [userId],
      WS_EVENT.FRIEND_DOLL_DELETED,
      {
        friendId: userId,
        dollId,
      },
    );
  }
}
