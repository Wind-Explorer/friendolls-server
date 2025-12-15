import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { User, FriendRequest, FriendRequestStatus } from '@prisma/client';

export type FriendRequestWithRelations = FriendRequest & {
  sender: User;
  receiver: User;
};

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendFriendRequest(
    senderId: string,
    receiverId: string,
  ): Promise<FriendRequestWithRelations> {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    const existingFriendship = await this.areFriends(senderId, receiverId);
    if (existingFriendship) {
      throw new ConflictException('You are already friends with this user');
    }

    const existingRequest = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          {
            senderId: receiverId,
            receiverId: senderId,
          },
        ],
      },
    });

    if (existingRequest) {
      if (existingRequest.status === FriendRequestStatus.PENDING) {
        if (existingRequest.senderId === senderId) {
          throw new ConflictException(
            'You already sent a friend request to this user',
          );
        } else {
          throw new ConflictException(
            'This user already sent you a friend request',
          );
        }
      } else {
        // If there's an existing request that is not pending (accepted or denied), delete it so a new one can be created
        await this.prisma.friendRequest.delete({
          where: { id: existingRequest.id },
        });
      }
    }

    const friendRequest = await this.prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        sender: true,
        receiver: true,
      },
    });

    this.logger.log(
      `Friend request sent from ${senderId} to ${receiverId} (ID: ${friendRequest.id})`,
    );

    return friendRequest;
  }

  async getPendingReceivedRequests(
    userId: string,
  ): Promise<FriendRequestWithRelations[]> {
    return this.prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        sender: true,
        receiver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getPendingSentRequests(
    userId: string,
  ): Promise<FriendRequestWithRelations[]> {
    return this.prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        sender: true,
        receiver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async acceptFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<FriendRequestWithRelations> {
    const friendRequest = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
      throw new BadRequestException(
        'You can only accept friend requests sent to you',
      );
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException(
        `Friend request is already ${friendRequest.status.toLowerCase()}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.friendRequest.delete({
        where: { id: requestId },
      }),
      this.prisma.friendship.create({
        data: {
          userId: friendRequest.senderId,
          friendId: friendRequest.receiverId,
        },
      }),
      this.prisma.friendship.create({
        data: {
          userId: friendRequest.receiverId,
          friendId: friendRequest.senderId,
        },
      }),
    ]);

    // Since we deleted the request, we return the original request object but with status accepted
    const result = {
      ...friendRequest,
      status: FriendRequestStatus.ACCEPTED,
      updatedAt: new Date(),
    };

    this.logger.log(
      `Friend request ${requestId} accepted. Users ${friendRequest.senderId} and ${friendRequest.receiverId} are now friends`,
    );

    return result;
  }

  async denyFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<FriendRequestWithRelations> {
    const friendRequest = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
      throw new BadRequestException(
        'You can only deny friend requests sent to you',
      );
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException(
        `Friend request is already ${friendRequest.status.toLowerCase()}`,
      );
    }

    await this.prisma.friendRequest.delete({
      where: { id: requestId },
    });

    // Since we deleted the request, we return the original request object but with status denied
    const result = {
      ...friendRequest,
      status: FriendRequestStatus.DENIED,
      updatedAt: new Date(),
    };

    this.logger.log(`Friend request ${requestId} denied by user ${userId}`);

    return result;
  }

  async getFriends(userId: string) {
    return this.prisma.friendship.findMany({
      where: { userId },
      include: {
        friend: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async unfriend(userId: string, friendId: string): Promise<void> {
    if (userId === friendId) {
      throw new BadRequestException('Cannot unfriend yourself');
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        userId,
        friendId,
      },
    });

    if (!friendship) {
      throw new NotFoundException('You are not friends with this user');
    }

    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });

    this.logger.log(`User ${userId} unfriended user ${friendId}`);
  }

  async areFriends(userId: string, friendId: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        userId,
        friendId,
      },
    });

    return !!friendship;
  }
}
