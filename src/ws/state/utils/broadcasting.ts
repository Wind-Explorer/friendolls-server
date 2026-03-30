import { UserSocketService } from '../user-socket.service';
import { WsNotificationService } from '../ws-notification.service';
import type { AuthenticatedSocket } from '../../../types/socket';

export class Broadcaster {
  constructor(
    private readonly userSocketService: UserSocketService,
    private readonly wsNotificationService: WsNotificationService,
  ) {}

  async touchPresence(client: AuthenticatedSocket) {
    await this.wsNotificationService.maybeTouchPresence(client);
  }

  async broadcastToFriends(friends: Set<string>, event: string, payload: any) {
    const friendIds = Array.from(friends);
    const friendSockets =
      await this.userSocketService.getFriendsSockets(friendIds);

    for (const { socketId } of friendSockets) {
      this.wsNotificationService.emitToSocket(socketId, event, payload);
    }
  }
}
