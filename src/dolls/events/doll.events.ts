import { Doll } from '@prisma/client';

export const DollEvents = {
  DOLL_CREATED: 'doll.created',
  DOLL_UPDATED: 'doll.updated',
  DOLL_DELETED: 'doll.deleted',
} as const;

export interface DollCreatedEvent {
  userId: string;
  doll: Doll;
}

export interface DollUpdatedEvent {
  userId: string;
  doll: Doll;
}

export interface DollDeletedEvent {
  userId: string;
  dollId: string;
}
