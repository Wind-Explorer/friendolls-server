import { Logger } from '@nestjs/common';
import { WsNotificationService } from '../ws-notification.service';

export class RedisHandler {
  private readonly logger = new Logger(RedisHandler.name);

  constructor(private readonly wsNotificationService: WsNotificationService) {}

  async handleActiveDollUpdateMessage(message: string): Promise<void> {
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

  async handleFriendCacheUpdateMessage(message: string): Promise<void> {
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

  async handleUserProfileCacheInvalidateMessage(
    message: string,
  ): Promise<void> {
    try {
      const data = JSON.parse(message) as {
        userId: string;
      };
      await this.wsNotificationService.clearSenderNameCache(data.userId);
    } catch (error) {
      this.logger.error(
        'Error handling user profile cache invalidate message',
        error,
      );
    }
  }
}
