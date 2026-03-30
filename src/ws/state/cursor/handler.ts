import { Logger } from '@nestjs/common';
import type { AuthenticatedSocket } from '../../../types/socket';
import { CursorPositionDto } from '../../dto/cursor-position.dto';
import { WS_EVENT } from '../ws-events';
import { Validator } from '../utils/validation';
import { Throttler } from '../utils/throttling';
import { Broadcaster } from '../utils/broadcasting';

const CURSOR_THROTTLE_MS = 100;

export class CursorHandler {
  private readonly logger = new Logger(CursorHandler.name);

  constructor(
    private readonly broadcaster: Broadcaster,
    private readonly throttler: Throttler,
  ) {}

  async handleCursorReportPosition(
    client: AuthenticatedSocket,
    data: CursorPositionDto,
  ) {
    Validator.validateUser(client);

    const currentUserId = client.data.userId;

    if (!currentUserId) {
      // User has not initialized yet
      return;
    }

    // Do not broadcast cursor position if user has no active doll
    if (!client.data.activeDollId) {
      return;
    }

    if (this.throttler.isThrottled(currentUserId, CURSOR_THROTTLE_MS)) {
      return;
    }

    // Broadcast to online friends
    const friends = client.data.friends;
    if (friends) {
      await this.broadcaster.touchPresence(client);
      const payload = {
        userId: currentUserId,
        position: data,
      };
      await this.broadcaster.broadcastToFriends(
        friends,
        WS_EVENT.FRIEND_CURSOR_POSITION,
        payload,
      );
    }
  }
}
