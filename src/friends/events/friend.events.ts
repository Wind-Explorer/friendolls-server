import { FriendRequest, User } from '@prisma/client';

export enum FriendEvents {
  REQUEST_RECEIVED = 'friend.request.received',
  REQUEST_ACCEPTED = 'friend.request.accepted',
  REQUEST_DENIED = 'friend.request.denied',
  UNFRIENDED = 'friend.unfriended',
}

export type FriendRequestWithRelations = FriendRequest & {
  sender: User;
  receiver: User;
};

export interface FriendRequestReceivedEvent {
  userId: string;
  friendRequest: FriendRequestWithRelations;
}

export interface FriendRequestAcceptedEvent {
  userId: string;
  friendRequest: FriendRequestWithRelations;
}

export interface FriendRequestDeniedEvent {
  userId: string;
  friendRequest: FriendRequestWithRelations;
}

export interface UnfriendedEvent {
  userId: string;
  friendId: string;
}
