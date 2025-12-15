import { Test, TestingModule } from '@nestjs/testing';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { StateGateway } from '../ws/state/state.gateway';

enum FriendRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DENIED = 'DENIED',
}

describe('FriendsController', () => {
  let controller: FriendsController;

  const mockAuthUser = {
    keycloakSub: 'f:realm:user1',
    email: 'user1@example.com',
    name: 'User One',
    username: 'user1',
  };

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
    friend: mockUser2,
  };

  const mockFriendsService = {
    sendFriendRequest: jest.fn(),
    getPendingReceivedRequests: jest.fn(),
    getPendingSentRequests: jest.fn(),
    acceptFriendRequest: jest.fn(),
    denyFriendRequest: jest.fn(),
    getFriends: jest.fn(),
    unfriend: jest.fn(),
  };

  const mockUsersService = {
    searchUsers: jest.fn(),
  };

  const mockAuthService = {
    syncUserFromToken: jest.fn(),
    ensureUserExists: jest.fn(),
  };

  const mockStateGateway = {
    emitFriendRequestReceived: jest.fn(),
    emitFriendRequestAccepted: jest.fn(),
    emitFriendRequestDenied: jest.fn(),
    emitUnfriended: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendsController],
      providers: [
        { provide: FriendsService, useValue: mockFriendsService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: StateGateway, useValue: mockStateGateway },
      ],
    }).compile();

    controller = module.get<FriendsController>(FriendsController);

    jest.clearAllMocks();
    mockAuthService.syncUserFromToken.mockResolvedValue(mockUser1);
    mockAuthService.ensureUserExists.mockResolvedValue(mockUser1);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('searchUsers', () => {
    it('should return list of users matching search', async () => {
      const users = [mockUser2];
      mockUsersService.searchUsers.mockResolvedValue(users);

      const result = await controller.searchUsers(
        { username: 'user2' },
        mockAuthUser,
      );

      expect(result).toEqual([
        {
          id: mockUser2.id,
          name: mockUser2.name,
          username: mockUser2.username,
          picture: undefined,
        },
      ]);
      expect(mockUsersService.searchUsers).toHaveBeenCalledWith(
        'user2',
        'user-1',
      );
    });
  });

  describe('sendFriendRequest', () => {
    it('should send friend request and emit WebSocket event', async () => {
      mockFriendsService.sendFriendRequest.mockResolvedValue(mockFriendRequest);

      const result = await controller.sendFriendRequest(
        { receiverId: 'user-2' },
        mockAuthUser,
      );

      expect(result).toEqual({
        id: mockFriendRequest.id,
        sender: {
          id: mockUser1.id,
          name: mockUser1.name,
          username: mockUser1.username,
          picture: undefined,
        },
        receiver: {
          id: mockUser2.id,
          name: mockUser2.name,
          username: mockUser2.username,
          picture: undefined,
        },
        status: FriendRequestStatus.PENDING,
        createdAt: mockFriendRequest.createdAt,
        updatedAt: mockFriendRequest.updatedAt,
      });
      expect(mockFriendsService.sendFriendRequest).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(mockStateGateway.emitFriendRequestReceived).toHaveBeenCalledWith(
        'user-2',
        mockFriendRequest,
      );
    });
  });

  describe('getReceivedRequests', () => {
    it('should return list of received friend requests', async () => {
      mockFriendsService.getPendingReceivedRequests.mockResolvedValue([
        mockFriendRequest,
      ]);

      const result = await controller.getReceivedRequests(mockAuthUser);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockFriendRequest.id);
      expect(
        mockFriendsService.getPendingReceivedRequests,
      ).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getSentRequests', () => {
    it('should return list of sent friend requests', async () => {
      mockFriendsService.getPendingSentRequests.mockResolvedValue([
        mockFriendRequest,
      ]);

      const result = await controller.getSentRequests(mockAuthUser);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockFriendRequest.id);
      expect(mockFriendsService.getPendingSentRequests).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });

  describe('acceptFriendRequest', () => {
    it('should accept friend request and emit WebSocket event', async () => {
      const acceptedRequest = {
        ...mockFriendRequest,
        status: FriendRequestStatus.ACCEPTED,
      };
      mockFriendsService.acceptFriendRequest.mockResolvedValue(acceptedRequest);

      const result = await controller.acceptFriendRequest(
        'request-1',
        mockAuthUser,
      );

      expect(result.status).toBe(FriendRequestStatus.ACCEPTED);
      expect(mockFriendsService.acceptFriendRequest).toHaveBeenCalledWith(
        'request-1',
        'user-1',
      );
      expect(mockStateGateway.emitFriendRequestAccepted).toHaveBeenCalledWith(
        'user-1',
        acceptedRequest,
      );
    });
  });

  describe('denyFriendRequest', () => {
    it('should deny friend request and emit WebSocket event', async () => {
      const deniedRequest = {
        ...mockFriendRequest,
        status: FriendRequestStatus.DENIED,
      };
      mockFriendsService.denyFriendRequest.mockResolvedValue(deniedRequest);

      const result = await controller.denyFriendRequest(
        'request-1',
        mockAuthUser,
      );

      expect(result.status).toBe(FriendRequestStatus.DENIED);
      expect(mockFriendsService.denyFriendRequest).toHaveBeenCalledWith(
        'request-1',
        'user-1',
      );
      expect(mockStateGateway.emitFriendRequestDenied).toHaveBeenCalledWith(
        'user-1',
        deniedRequest,
      );
    });
  });

  describe('getFriends', () => {
    it('should return list of friends', async () => {
      mockFriendsService.getFriends.mockResolvedValue([mockFriendship]);

      const result = await controller.getFriends(mockAuthUser);

      expect(result).toEqual([
        {
          id: mockFriendship.id,
          friend: {
            id: mockUser2.id,
            name: mockUser2.name,
            username: mockUser2.username,
            picture: undefined,
          },
          createdAt: mockFriendship.createdAt,
        },
      ]);
      expect(mockFriendsService.getFriends).toHaveBeenCalledWith('user-1');
    });
  });

  describe('unfriend', () => {
    it('should unfriend user and emit WebSocket event', async () => {
      mockFriendsService.unfriend.mockResolvedValue(undefined);

      await controller.unfriend('user-2', mockAuthUser);

      expect(mockFriendsService.unfriend).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(mockStateGateway.emitUnfriended).toHaveBeenCalledWith(
        'user-2',
        'user-1',
      );
    });
  });
});
