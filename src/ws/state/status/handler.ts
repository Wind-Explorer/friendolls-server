import { Logger } from '@nestjs/common';
import type { AuthenticatedSocket } from '../../../types/socket';
import { UserStatusDto } from '../../dto/user-status.dto';
import { WS_EVENT } from '../ws-events';
import { Validator } from '../utils/validation';
import { Throttler } from '../utils/throttling';
import { Broadcaster } from '../utils/broadcasting';

const USER_STATUS_BROADCAST_THROTTLING_MS = 200;

export class StatusHandler {
  private readonly logger = new Logger(StatusHandler.name);

  constructor(
    private readonly broadcaster: Broadcaster,
    private readonly throttler: Throttler,
  ) {}

  async handleClientReportUserStatus(
    client: AuthenticatedSocket,
    data: UserStatusDto,
  ) {
    Validator.validateUser(client);

    const currentUserId = client.data.userId;

    if (!currentUserId) {
      // User has not initialized yet
      return;
    }

    // Do not broadcast user status if user has no active doll
    if (!client.data.activeDollId) {
      return;
    }

    if (
      this.throttler.isThrottled(
        currentUserId,
        USER_STATUS_BROADCAST_THROTTLING_MS,
      )
    ) {
      return;
    }

    // Broadcast to online friends
    const friends = client.data.friends;
    if (friends) {
      try {
        await this.broadcaster.touchPresence(client);
        const payload = {
          userId: currentUserId,
          status: data,
        };
        await this.broadcaster.broadcastToFriends(
          friends,
          WS_EVENT.FRIEND_USER_STATUS,
          payload,
        );
        this.logger.debug(
          `Broadcasted user status to friends for user ${currentUserId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to broadcast user status for user ${currentUserId}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }
}
