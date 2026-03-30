import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheTagsService } from '../common/cache/cache-tags.service';
import { CACHE_NAMESPACE, dollsListOwnerTag } from '../common/cache/cache-keys';
import { DollEvents } from './events/doll.events';
import {
  type DollCreatedEvent,
  type DollDeletedEvent,
  type DollUpdatedEvent,
} from './events/doll.events';

@Injectable()
export class DollsCacheInvalidationService {
  constructor(private readonly cacheTagsService: CacheTagsService) {}

  @OnEvent(DollEvents.DOLL_CREATED)
  async handleDollCreated(payload: DollCreatedEvent): Promise<void> {
    await this.invalidateOwnerLists(payload.userId);
  }

  @OnEvent(DollEvents.DOLL_UPDATED)
  async handleDollUpdated(payload: DollUpdatedEvent): Promise<void> {
    await this.invalidateOwnerLists(payload.userId);
  }

  @OnEvent(DollEvents.DOLL_DELETED)
  async handleDollDeleted(payload: DollDeletedEvent): Promise<void> {
    await this.invalidateOwnerLists(payload.userId);
  }

  private async invalidateOwnerLists(ownerId: string): Promise<void> {
    await this.cacheTagsService.invalidateTag(
      CACHE_NAMESPACE.DOLLS_LIST,
      dollsListOwnerTag(ownerId),
    );
  }
}
