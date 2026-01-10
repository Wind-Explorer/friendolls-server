export const WS_EVENT = {
  CLIENT_INITIALIZE: 'client-initialize',
  INITIALIZED: 'initialized',
  CURSOR_REPORT_POSITION: 'cursor-report-position',
  FRIEND_REQUEST_RECEIVED: 'friend-request-received',
  FRIEND_REQUEST_ACCEPTED: 'friend-request-accepted',
  FRIEND_REQUEST_DENIED: 'friend-request-denied',
  UNFRIENDED: 'unfriended',
  FRIEND_CURSOR_POSITION: 'friend-cursor-position',
  FRIEND_DISCONNECTED: 'friend-disconnected',
  FRIEND_DOLL_CREATED: 'friend-doll-created',
  FRIEND_DOLL_UPDATED: 'friend-doll-updated',
  FRIEND_DOLL_DELETED: 'friend-doll-deleted',
  FRIEND_ACTIVE_DOLL_CHANGED: 'friend-active-doll-changed',
} as const;

export const REDIS_CHANNEL = {
  ACTIVE_DOLL_UPDATE: 'active-doll-update',
  FRIEND_CACHE_UPDATE: 'friend-cache-update',
} as const;
