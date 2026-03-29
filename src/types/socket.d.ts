import type { Socket as BaseSocket } from 'socket.io';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';

export type AuthenticatedSocket = BaseSocket<
  DefaultEventsMap, // ClientToServerEvents
  DefaultEventsMap, // ServerToClientEvents
  DefaultEventsMap, // InterServerEvents
  {
    user?: AuthenticatedUser;
    userId?: string;
    activeDollId?: string | null;
    friends?: Set<string>; // Set of friend user IDs
    senderName?: string;
    senderNameCachedAt?: number;
  }
>;
