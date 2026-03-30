const EMPTY_VALUE_TOKEN = '_';

export const CACHE_NAMESPACE = {
  FRIENDS_LIST: 'friends-list',
  DOLLS_LIST: 'dolls-list',
  USERS_SEARCH: 'users-search',
} as const;

function normalizeKeyPart(value: string | undefined): string {
  if (!value) {
    return EMPTY_VALUE_TOKEN;
  }

  return encodeURIComponent(value);
}

export const CACHE_TTL_SECONDS = {
  FRIENDS_LIST: 30,
  DOLLS_LIST: 30,
  USERS_SEARCH: 20,
} as const;

export function friendsListCacheKey(userId: string): string {
  return normalizeKeyPart(userId);
}

export function friendsListOwnerTag(userId: string): string {
  return `owner:${normalizeKeyPart(userId)}`;
}

export function friendsListDependsOnUserTag(userId: string): string {
  return `depends-on:${normalizeKeyPart(userId)}`;
}

export function dollsListCacheKey(
  ownerId: string,
  requesterId: string,
): string {
  return `${normalizeKeyPart(ownerId)}:${normalizeKeyPart(requesterId)}`;
}

export function dollsListOwnerTag(ownerId: string): string {
  return `owner:${normalizeKeyPart(ownerId)}`;
}

export function dollsListViewerTag(viewerId: string): string {
  return `viewer:${normalizeKeyPart(viewerId)}`;
}

export function usersSearchCacheKey(
  username: string | undefined,
  excludeUserId: string | undefined,
): string {
  return `${normalizeKeyPart(username?.trim().toLowerCase())}:${normalizeKeyPart(excludeUserId)}`;
}

export const USERS_SEARCH_GLOBAL_TAG = 'global';

export function usersSearchUserTag(userId: string): string {
  return `user:${normalizeKeyPart(userId)}`;
}
