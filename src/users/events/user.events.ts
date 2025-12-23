import { Doll } from '@prisma/client';

export const UserEvents = {
  ACTIVE_DOLL_CHANGED: 'user.active-doll.changed',
} as const;

export interface UserActiveDollChangedEvent {
  userId: string;
  dollId: string | null;
  doll: Doll | null;
}
