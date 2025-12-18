import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FriendsService } from './friends.service';
import { PrismaService } from '../database/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

enum FriendRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DENIED = 'DENIED',
}

describe('FriendsService', () => {
  let service: FriendsService;
  let eventEmitter: EventEmitter2;

  const mockUser1 = {
    id: 'user-1',
    keycloakSub: 'f:realm:user1',
    email: 'user1@example.com',
    name: 'User One',
    username: 'user1',
    picture: null,
    roles: [],
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser2 = {
    id: 'user-2',
    keycloakSub: 'f:realm:user2',
    email: 'user2@example.com',
    name: 'User Two',
    username: 'user2',
    picture: null,
    roles: [],
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFriendRequest = {
    id: 'request-1',
    senderId: 'user-1',
    receiverId: 'user-2',
    status: FriendRequestStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: mockUser1,
    receiver: mockUser2,
  };

  const mockFriendship = {
    id: 'friendship-1',
    userId: 'user-1',
    friendId: 'user-2',
    createdAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    friendRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    friendship: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<FriendsService>(FriendsService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendFriendRequest', () => {
    it('should send a friend request successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser2);
      mockPrismaService.friendship.findFirst.mockResolvedValue(null);
      mockPrismaService.friendRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.friendRequest.create.mockResolvedValue(
        mockFriendRequest,
      );
      // Mock transaction implementation
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (prisma: any) => Promise<any>) => {
          return (await callback(mockPrismaService)) as unknown;
        },
      );

      const result = await service.sendFriendRequest('user-1', 'user-2');

      expect(result).toEqual(mockFriendRequest);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-2' },
      });
      expect(mockPrismaService.friendRequest.create).toHaveBeenCalledWith({
        data: {
          senderId: 'user-1',
          receiverId: 'user-2',
          status: FriendRequestStatus.PENDING,
        },
        include: {
          sender: true,
          receiver: true,
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('should throw BadRequestException when trying to send request to self', async () => {
      await expect(
        service.sendFriendRequest('user-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendFriendRequest('user-1', 'user-1'),
      ).rejects.toThrow('Cannot send friend request to yourself');
    });

    it('should throw NotFoundException when receiver does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (prisma: any) => Promise<any>) => {
          return (await callback(mockPrismaService)) as unknown;
        },
      );

      await expect(
        service.sendFriendRequest('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.sendFriendRequest('user-1', 'nonexistent'),
      ).rejects.toThrow('User not found');
    });

    it('should throw ConflictException when users are already friends', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser2);
      mockPrismaService.friendship.findFirst.mockResolvedValue(mockFriendship);
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (prisma: any) => Promise<any>) => {
          return (await callback(mockPrismaService)) as unknown;
        },
      );

      await expect(
        service.sendFriendRequest('user-1', 'user-2'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.sendFriendRequest('user-1', 'user-2'),
      ).rejects.toThrow('You are already friends with this user');
    });

    it('should throw ConflictException when request already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser2);
      mockPrismaService.friendship.findFirst.mockResolvedValue(null);
      mockPrismaService.friendRequest.findFirst.mockResolvedValue(
        mockFriendRequest,
      );
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (prisma: any) => Promise<any>) => {
          return (await callback(mockPrismaService)) as unknown;
        },
      );

      await expect(
        service.sendFriendRequest('user-1', 'user-2'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.sendFriendRequest('user-1', 'user-2'),
      ).rejects.toThrow('You already sent a friend request to this user');
    });

    it('should throw ConflictException when reverse request exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser1);
      mockPrismaService.friendship.findFirst.mockResolvedValue(null);
      mockPrismaService.friendRequest.findFirst.mockResolvedValue({
        ...mockFriendRequest,
        senderId: 'user-2',
        receiverId: 'user-1',
      });
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (prisma: any) => Promise<any>) => {
          return (await callback(mockPrismaService)) as unknown;
        },
      );

      await expect(
        service.sendFriendRequest('user-1', 'user-2'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.sendFriendRequest('user-1', 'user-2'),
      ).rejects.toThrow('This user already sent you a friend request');
    });
  });

  describe('getPendingReceivedRequests', () => {
    it('should return pending received requests', async () => {
      const requests = [mockFriendRequest];
      mockPrismaService.friendRequest.findMany.mockResolvedValue(requests);

      const result = await service.getPendingReceivedRequests('user-2');

      expect(result).toEqual(requests);
      expect(mockPrismaService.friendRequest.findMany).toHaveBeenCalledWith({
        where: {
          receiverId: 'user-2',
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
    });
  });

  describe('getPendingSentRequests', () => {
    it('should return pending sent requests', async () => {
      const requests = [mockFriendRequest];
      mockPrismaService.friendRequest.findMany.mockResolvedValue(requests);

      const result = await service.getPendingSentRequests('user-1');

      expect(result).toEqual(requests);
      expect(mockPrismaService.friendRequest.findMany).toHaveBeenCalledWith({
        where: {
          senderId: 'user-1',
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
    });
  });

  describe('acceptFriendRequest', () => {
    it('should accept a friend request and create friendship', async () => {
      const acceptedRequest = {
        ...mockFriendRequest,
        status: FriendRequestStatus.ACCEPTED,
        updatedAt: expect.any(Date),
      };
      mockPrismaService.friendRequest.findUnique.mockResolvedValue(
        mockFriendRequest,
      );
      mockPrismaService.$transaction.mockResolvedValue([acceptedRequest]);

      const result = await service.acceptFriendRequest('request-1', 'user-2');

      expect(result).toEqual(acceptedRequest);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrismaService.friendRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptFriendRequest('nonexistent', 'user-2'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.acceptFriendRequest('nonexistent', 'user-2'),
      ).rejects.toThrow('Friend request not found');
    });

    it('should throw BadRequestException when user is not the receiver', async () => {
      mockPrismaService.friendRequest.findUnique.mockResolvedValue(
        mockFriendRequest,
      );

      await expect(
        service.acceptFriendRequest('request-1', 'user-3'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.acceptFriendRequest('request-1', 'user-3'),
      ).rejects.toThrow('You can only accept friend requests sent to you');
    });

    it('should throw BadRequestException when request is already accepted', async () => {
      mockPrismaService.friendRequest.findUnique.mockResolvedValue({
        ...mockFriendRequest,
        status: FriendRequestStatus.ACCEPTED,
      });

      await expect(
        service.acceptFriendRequest('request-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.acceptFriendRequest('request-1', 'user-2'),
      ).rejects.toThrow('Friend request is already accepted');
    });
  });

  describe('denyFriendRequest', () => {
    it('should deny a friend request', async () => {
      const deniedRequest = {
        ...mockFriendRequest,
        status: FriendRequestStatus.DENIED,
        updatedAt: expect.any(Date),
      };
      mockPrismaService.friendRequest.findUnique.mockResolvedValue(
        mockFriendRequest,
      );
      mockPrismaService.friendRequest.delete.mockResolvedValue(
        mockFriendRequest,
      );

      const result = await service.denyFriendRequest('request-1', 'user-2');

      expect(result).toEqual(deniedRequest);
      expect(mockPrismaService.friendRequest.delete).toHaveBeenCalledWith({
        where: { id: 'request-1' },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrismaService.friendRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.denyFriendRequest('nonexistent', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is not the receiver', async () => {
      mockPrismaService.friendRequest.findUnique.mockResolvedValue(
        mockFriendRequest,
      );

      await expect(
        service.denyFriendRequest('request-1', 'user-3'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when request is already denied', async () => {
      mockPrismaService.friendRequest.findUnique.mockResolvedValue({
        ...mockFriendRequest,
        status: FriendRequestStatus.DENIED,
      });

      await expect(
        service.denyFriendRequest('request-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFriends', () => {
    it('should return list of friends', async () => {
      const friendships = [
        {
          ...mockFriendship,
          friend: mockUser2,
        },
      ];
      mockPrismaService.friendship.findMany.mockResolvedValue(friendships);

      const result = await service.getFriends('user-1');

      expect(result).toEqual(friendships);
      expect(mockPrismaService.friendship.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: {
          friend: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('unfriend', () => {
    it('should unfriend a user successfully', async () => {
      mockPrismaService.friendship.findFirst.mockResolvedValue(mockFriendship);
      mockPrismaService.friendship.deleteMany.mockResolvedValue({ count: 2 });

      await service.unfriend('user-1', 'user-2');

      expect(mockPrismaService.friendship.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { userId: 'user-1', friendId: 'user-2' },
            { userId: 'user-2', friendId: 'user-1' },
          ],
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('should throw BadRequestException when trying to unfriend self', async () => {
      await expect(service.unfriend('user-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.unfriend('user-1', 'user-1')).rejects.toThrow(
        'Cannot unfriend yourself',
      );
    });

    it('should throw NotFoundException when not friends', async () => {
      mockPrismaService.friendship.findFirst.mockResolvedValue(null);

      await expect(service.unfriend('user-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.unfriend('user-1', 'user-2')).rejects.toThrow(
        'You are not friends with this user',
      );
    });
  });

  describe('areFriends', () => {
    it('should return true when users are friends', async () => {
      mockPrismaService.friendship.findFirst.mockResolvedValue(mockFriendship);

      const result = await service.areFriends('user-1', 'user-2');

      expect(result).toBe(true);
    });

    it('should return false when users are not friends', async () => {
      mockPrismaService.friendship.findFirst.mockResolvedValue(null);

      const result = await service.areFriends('user-1', 'user-2');

      expect(result).toBe(false);
    });
  });
});
