import { Doll } from '@prisma/client';

export const UserEvents = {
  ACTIVE_DOLL_CHANGED: 'user.active-doll.changed',
  SEARCH_INDEX_INVALIDATED: 'user.search-index.invalidated',
} as const;

export interface UserActiveDollChangedEvent {
  userId: string;
  dollId: string | null;
  doll: Doll | null;
}

export interface UserSearchIndexInvalidatedEvent {
  userId?: string;
}
