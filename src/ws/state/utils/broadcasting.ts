import { UserSocketService } from '../user-socket.service';
import { WsNotificationService } from '../ws-notification.service';

export class Broadcaster {
  constructor(
    private readonly userSocketService: UserSocketService,
    private readonly wsNotificationService: WsNotificationService,
  ) {}

  async broadcastToFriends(friends: Set<string>, event: string, payload: any) {
    const friendIds = Array.from(friends);
    const friendSockets =
      await this.userSocketService.getFriendsSockets(friendIds);

    for (const { socketId } of friendSockets) {
      this.wsNotificationService.emitToSocket(socketId, event, payload);
    }
  }
}
