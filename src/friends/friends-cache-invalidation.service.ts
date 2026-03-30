import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheTagsService } from '../common/cache/cache-tags.service';
import {
  CACHE_NAMESPACE,
  dollsListViewerTag,
  friendshipCheckUserTag,
  friendsListDependsOnUserTag,
  friendsListOwnerTag,
} from '../common/cache/cache-keys';
import { FriendEvents } from './events/friend.events';
import type {
  FriendRequestAcceptedEvent,
  UnfriendedEvent,
} from './events/friend.events';

@Injectable()
export class FriendsCacheInvalidationService {
  constructor(private readonly cacheTagsService: CacheTagsService) {}

  @OnEvent(FriendEvents.REQUEST_ACCEPTED)
  async handleFriendAccepted(
    payload: FriendRequestAcceptedEvent,
  ): Promise<void> {
    const senderId = payload.friendRequest.senderId;
    const receiverId = payload.friendRequest.receiverId;
    await this.invalidateFriendAndDollViews(senderId, receiverId);
  }

  @OnEvent(FriendEvents.UNFRIENDED)
  async handleUnfriended(payload: UnfriendedEvent): Promise<void> {
    await this.invalidateFriendAndDollViews(payload.userId, payload.friendId);
  }

  private async invalidateFriendAndDollViews(
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    await Promise.all([
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.FRIENDS_LIST,
        friendsListOwnerTag(firstUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.FRIENDS_LIST,
        friendsListOwnerTag(secondUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.FRIENDS_LIST,
        friendsListDependsOnUserTag(firstUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.FRIENDS_LIST,
        friendsListDependsOnUserTag(secondUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.DOLLS_LIST,
        dollsListViewerTag(firstUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.DOLLS_LIST,
        dollsListViewerTag(secondUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.FRIENDSHIP_CHECK,
        friendshipCheckUserTag(firstUserId),
      ),
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.FRIENDSHIP_CHECK,
        friendshipCheckUserTag(secondUserId),
      ),
    ]);
  }
}
