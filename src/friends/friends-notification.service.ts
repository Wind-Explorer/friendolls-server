import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsNotificationService } from '../ws/state/ws-notification.service';
import { UserSocketService } from '../ws/state/user-socket.service';
import { WS_EVENT } from '../ws/state/ws-events';
import type {
  FriendRequestReceivedEvent,
  FriendRequestAcceptedEvent,
  FriendRequestDeniedEvent,
  UnfriendedEvent,
} from './events/friend.events';
import { FriendEvents } from './events/friend.events';

@Injectable()
export class FriendsNotificationService {
  private readonly logger = new Logger(FriendsNotificationService.name);

  constructor(
    private readonly wsNotificationService: WsNotificationService,
    private readonly userSocketService: UserSocketService,
  ) {}

  @OnEvent(FriendEvents.REQUEST_RECEIVED)
  async handleFriendRequestReceived(payload: FriendRequestReceivedEvent) {
    const { userId, friendRequest } = payload;
    await this.wsNotificationService.emitToUser(
      userId,
      WS_EVENT.FRIEND_REQUEST_RECEIVED,
      {
        id: friendRequest.id,
        sender: {
          id: friendRequest.sender.id,
          name: friendRequest.sender.name,
          username: friendRequest.sender.username,
          picture: friendRequest.sender.picture,
        },
        createdAt: friendRequest.createdAt,
      },
    );
    this.logger.debug(`Emitted friend request notification to user ${userId}`);
  }

  @OnEvent(FriendEvents.REQUEST_ACCEPTED)
  async handleFriendRequestAccepted(payload: FriendRequestAcceptedEvent) {
    const { userId, friendRequest } = payload;

    // Update cache for the sender
    await this.wsNotificationService.updateFriendsCache(
      friendRequest.senderId,
      friendRequest.receiverId,
      'add',
    );

    // Update cache for the receiver
    await this.wsNotificationService.updateFriendsCache(
      friendRequest.receiverId,
      friendRequest.senderId,
      'add',
    );

    // Emit to sender
    await this.wsNotificationService.emitToUser(
      userId,
      WS_EVENT.FRIEND_REQUEST_ACCEPTED,
      {
        id: friendRequest.id,
        friend: {
          id: friendRequest.receiver.id,
          name: friendRequest.receiver.name,
          username: friendRequest.receiver.username,
          picture: friendRequest.receiver.picture,
        },
        acceptedAt: friendRequest.updatedAt,
      },
    );
    this.logger.debug(
      `Emitted friend request accepted notification to user ${userId}`,
    );
  }

  @OnEvent(FriendEvents.REQUEST_DENIED)
  async handleFriendRequestDenied(payload: FriendRequestDeniedEvent) {
    const { userId, friendRequest } = payload;
    await this.wsNotificationService.emitToUser(
      userId,
      WS_EVENT.FRIEND_REQUEST_DENIED,
      {
        id: friendRequest.id,
        denier: {
          id: friendRequest.receiver.id,
          name: friendRequest.receiver.name,
          username: friendRequest.receiver.username,
          picture: friendRequest.receiver.picture,
        },
        deniedAt: friendRequest.updatedAt,
      },
    );
    this.logger.debug(
      `Emitted friend request denied notification to user ${userId}`,
    );
  }

  @OnEvent(FriendEvents.UNFRIENDED)
  async handleUnfriended(payload: UnfriendedEvent) {
    const { userId, friendId } = payload;

    // Update cache for the user receiving the notification
    await this.wsNotificationService.updateFriendsCache(
      userId,
      friendId,
      'delete',
    );

    // Update cache for the user initiating the unfriend
    await this.wsNotificationService.updateFriendsCache(
      friendId,
      userId,
      'delete',
    );

    // Emit to the user
    await this.wsNotificationService.emitToUser(userId, WS_EVENT.UNFRIENDED, {
      friendId,
    });
    this.logger.debug(`Emitted unfriended notification to user ${userId}`);
  }
}
