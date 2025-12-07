import { User } from '@prisma/client';

export enum FriendRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DENIED = 'DENIED',
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  sender: User;
  receiver: User;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  createdAt: Date;
  user: User;
  friend: User;
}
