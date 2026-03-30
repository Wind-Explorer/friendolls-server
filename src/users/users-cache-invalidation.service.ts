import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheTagsService } from '../common/cache/cache-tags.service';
import {
  CACHE_NAMESPACE,
  USERS_SEARCH_GLOBAL_TAG,
  usersSearchUserTag,
} from '../common/cache/cache-keys';
import { UserEvents } from './events/user.events';
import type { UserSearchIndexInvalidatedEvent } from './events/user.events';

@Injectable()
export class UsersCacheInvalidationService {
  constructor(private readonly cacheTagsService: CacheTagsService) {}

  @OnEvent(UserEvents.SEARCH_INDEX_INVALIDATED)
  async handleSearchIndexInvalidation(
    payload: UserSearchIndexInvalidatedEvent,
  ): Promise<void> {
    const tasks: Promise<void>[] = [
      this.cacheTagsService.invalidateTag(
        CACHE_NAMESPACE.USERS_SEARCH,
        USERS_SEARCH_GLOBAL_TAG,
      ),
    ];

    if (payload.userId) {
      tasks.push(
        this.cacheTagsService.invalidateTag(
          CACHE_NAMESPACE.USERS_SEARCH,
          usersSearchUserTag(payload.userId),
        ),
      );
    }

    await Promise.all(tasks);
  }
}
