import { CursorPositionDto } from '../dto/cursor-position.dto';
import { Test, TestingModule } from '@nestjs/testing';
import { StateGateway } from './state.gateway';
import { AuthenticatedSocket } from '../../types/socket';
import { AuthService } from '../../auth/auth.service';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';
import { PrismaService } from '../../database/prisma.service';
import { UserSocketService } from './user-socket.service';
import { WsNotificationService } from './ws-notification.service';
import { SendInteractionDto } from '../dto/send-interaction.dto';
import { WsException } from '@nestjs/websockets';

import { UserStatusDto, UserState } from '../dto/user-status.dto';

interface MockSocket extends Partial<AuthenticatedSocket> {
  id: string;
  data: {
    user?: {
      keycloakSub: string;
      email?: string;
      name?: string;
      preferred_username?: string;
      picture?: string;
    };
    userId?: string;
    activeDollId?: string | null;
    friends?: Set<string>;
  };
  handshake?: any;
  disconnect?: jest.Mock;
  emit?: jest.Mock;
}

describe('StateGateway', () => {
  let gateway: StateGateway;
  let mockLoggerLog: jest.SpyInstance;
  let mockLoggerDebug: jest.SpyInstance;
  let mockLoggerWarn: jest.SpyInstance;
  let mockLoggerError: jest.SpyInstance;
  let mockServer: {
    sockets: { sockets: { size: number; get: jest.Mock } };
    to: jest.Mock;
  };
  let mockAuthService: Partial<AuthService>;
  let mockJwtVerificationService: Partial<JwtVerificationService>;
  let mockPrismaService: Partial<PrismaService>;
  let mockUserSocketService: Partial<UserSocketService>;
  let mockRedisClient: { publish: jest.Mock };
  let mockRedisSubscriber: { subscribe: jest.Mock; on: jest.Mock };
  let mockWsNotificationService: {
    setIo: jest.Mock;
    emitToUser: jest.Mock;
    emitToFriends: jest.Mock;
    emitToSocket: jest.Mock;
    updateActiveDollCache: jest.Mock;
    publishActiveDollUpdate: jest.Mock;
  };

  beforeEach(async () => {
    mockServer = {
      sockets: {
        sockets: {
          size: 5,
          get: jest.fn(),
        },
      },
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    };

    mockAuthService = {
      syncUserFromToken: jest.fn().mockResolvedValue({
        id: 'user-id',
        keycloakSub: 'test-sub',
      }),
    };

    mockJwtVerificationService = {
      extractToken: jest.fn((handshake) => handshake.auth?.token),
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'test-sub',
        email: 'test@example.com',
      }),
    };

    mockPrismaService = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ activeDollId: 'doll-123' }),
      } as any,
      friendship: {
        findMany: jest.fn().mockResolvedValue([]),
      } as any,
    };

    mockUserSocketService = {
      setSocket: jest.fn().mockResolvedValue(undefined),
      removeSocket: jest.fn().mockResolvedValue(undefined),
      getSocket: jest.fn().mockResolvedValue(null),
      isUserOnline: jest.fn().mockResolvedValue(false),
      getFriendsSockets: jest.fn().mockResolvedValue([]),
    };

    mockRedisClient = {
      publish: jest.fn().mockResolvedValue(1),
    };

    mockRedisSubscriber = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    mockWsNotificationService = {
      setIo: jest.fn(),
      emitToUser: jest.fn(),
      emitToFriends: jest.fn(),
      emitToSocket: jest.fn(),
      updateActiveDollCache: jest.fn(),
      publishActiveDollUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateGateway,
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: JwtVerificationService,
          useValue: mockJwtVerificationService,
        },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UserSocketService, useValue: mockUserSocketService },
        { provide: WsNotificationService, useValue: mockWsNotificationService },
        { provide: 'REDIS_CLIENT', useValue: mockRedisClient },
        { provide: 'REDIS_SUBSCRIBER_CLIENT', useValue: mockRedisSubscriber },
      ],
    }).compile();

    gateway = module.get<StateGateway>(StateGateway);
    gateway.io = mockServer as any;

    mockLoggerLog = jest.spyOn(gateway['logger'], 'log').mockImplementation();
    mockLoggerDebug = jest
      .spyOn(gateway['logger'], 'debug')
      .mockImplementation();
    mockLoggerWarn = jest.spyOn(gateway['logger'], 'warn').mockImplementation();
    mockLoggerError = jest
      .spyOn(gateway['logger'], 'error')
      .mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('afterInit', () => {
    it('should log initialization message', () => {
      gateway.afterInit();
      expect(mockLoggerLog).toHaveBeenCalledWith('Initialized');
    });

    it('should subscribe to redis channel', () => {
      expect(mockRedisSubscriber.subscribe).toHaveBeenCalledWith(
        'active-doll-update',
        'friend-cache-update',
        expect.any(Function),
      );
    });
  });

  describe('handleConnection', () => {
    it('should verify token and set basic user data (but NOT sync DB)', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
        handshake: {
          auth: { token: 'mock-token' },
          headers: {},
        },
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(
        mockClient as unknown as AuthenticatedSocket,
      );

      expect(mockJwtVerificationService.extractToken).toHaveBeenCalledWith(
        mockClient.handshake,
      );
      expect(mockJwtVerificationService.verifyToken).toHaveBeenCalledWith(
        'mock-token',
      );

      // Should NOT call these anymore in handleConnection
      expect(mockAuthService.syncUserFromToken).not.toHaveBeenCalled();
      expect(mockUserSocketService.setSocket).not.toHaveBeenCalled();

      // Should set data on client
      expect(mockClient.data.user).toEqual(
        expect.objectContaining({
          keycloakSub: 'test-sub',
        }),
      );
      expect(mockClient.data.activeDollId).toBeNull();

      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket authenticated (Pending Init)'),
      );
    });

    it('should disconnect client when no token provided', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
        handshake: {
          auth: {},
          headers: {},
        },
        disconnect: jest.fn(),
      };

      (mockJwtVerificationService.extractToken as jest.Mock).mockReturnValue(
        undefined,
      );

      await gateway.handleConnection(
        mockClient as unknown as AuthenticatedSocket,
      );

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'WebSocket connection attempt without token',
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleClientInitialize', () => {
    it('should sync user, fetch state, and emit initialized event', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          friends: new Set(),
        },
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      // Mock Prisma responses
      (mockPrismaService.user!.findUnique as jest.Mock).mockResolvedValue({
        activeDollId: 'doll-123',
      });
      (mockPrismaService.friendship!.findMany as jest.Mock).mockResolvedValue([
        { friendId: 'friend-1' },
        { friendId: 'friend-2' },
      ]);

      await gateway.handleClientInitialize(
        mockClient as unknown as AuthenticatedSocket,
      );

      // 1. Sync User
      expect(mockAuthService.syncUserFromToken).toHaveBeenCalledWith(
        mockClient.data.user,
      );

      // 2. Set Socket
      expect(mockUserSocketService.setSocket).toHaveBeenCalledWith(
        'user-id',
        'client1',
      );

      // 3. Fetch State (DB)
      expect(mockPrismaService.user!.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: { activeDollId: true },
      });
      expect(mockPrismaService.friendship!.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        select: { friendId: true },
      });

      // 4. Update Client Data
      expect(mockClient.data.userId).toBe('user-id');
      expect(mockClient.data.activeDollId).toBe('doll-123');
      expect(mockClient.data.friends).toContain('friend-1');
      expect(mockClient.data.friends).toContain('friend-2');

      // 5. Emit Initialized
      expect(mockClient.emit).toHaveBeenCalledWith('initialized', {
        userId: 'user-id',
        activeDollId: 'doll-123',
      });
    });

    it('should disconnect if no user data present on socket', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {}, // Missing user data
        handshake: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleClientInitialize(
        mockClient as unknown as AuthenticatedSocket,
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Unauthorized: No user data found'),
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should log client disconnection', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: { user: { keycloakSub: 'test-sub' } },
      };

      await gateway.handleDisconnect(
        mockClient as unknown as AuthenticatedSocket,
      );

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Client id: ${mockClient.id} disconnected (user: test-sub)`,
      );
    });

    it('should handle disconnection when no user data', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
      };

      await gateway.handleDisconnect(
        mockClient as unknown as AuthenticatedSocket,
      );

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Client id: ${mockClient.id} disconnected (user: unknown)`,
      );
    });

    it('should remove socket if it matches', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-id',
          friends: new Set(['friend-1']),
        },
      };

      (mockUserSocketService.getSocket as jest.Mock).mockResolvedValue(
        'client1',
      );
      (mockUserSocketService.getFriendsSockets as jest.Mock).mockResolvedValue([
        { userId: 'friend-1', socketId: 'friend-socket-id' },
      ]);

      await gateway.handleDisconnect(
        mockClient as unknown as AuthenticatedSocket,
      );

      expect(mockUserSocketService.getSocket).toHaveBeenCalledWith('user-id');
      expect(mockUserSocketService.removeSocket).toHaveBeenCalledWith(
        'user-id',
      );
      expect(mockWsNotificationService.emitToSocket).toHaveBeenCalledWith(
        'friend-socket-id',
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('handleCursorReportPosition', () => {
    it('should emit cursor position to connected friends', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          activeDollId: 'doll-1', // User must have active doll
          friends: new Set(['friend-1']),
        },
      };

      // Mock getFriendsSockets to return the friend's socket
      (mockUserSocketService.getFriendsSockets as jest.Mock).mockResolvedValue([
        { userId: 'friend-1', socketId: 'friend-socket-id' },
      ]);

      const data: CursorPositionDto = { x: 100, y: 200 };

      // Force time to pass for throttle check if needed, or rely on first call passing
      // The implementation uses lastBroadcastMap, initialized to empty, so first call should pass if now > 0

      await gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that message was emitted via WsNotificationService
      expect(mockWsNotificationService.emitToSocket).toHaveBeenCalledWith(
        'friend-socket-id',
        'friend-cursor-position',
        {
          userId: 'user-1',
          position: data,
        },
      );
    });

    it('should NOT emit if user has no active doll', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          activeDollId: null, // No doll
          friends: new Set(['friend-1']),
        },
      };

      const data: CursorPositionDto = { x: 100, y: 200 };

      await gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should return early when userId is missing (not initialized)', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          // userId is missing
          friends: new Set(['friend-1']),
        },
      };

      const data: CursorPositionDto = { x: 100, y: 200 };

      await gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that no message was emitted
      expect(mockServer.to).not.toHaveBeenCalled();
      // No explicit warning log expected in new implementation for just return
    });

    it('should throw exception when client is not authenticated', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
      };
      const data: CursorPositionDto = { x: 100, y: 200 };

      await expect(
        gateway.handleCursorReportPosition(
          mockClient as unknown as AuthenticatedSocket,
          data,
        ),
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('handleClientReportUserStatus', () => {
    it('should emit user status to connected friends', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          activeDollId: 'doll-1', // User must have active doll
          friends: new Set(['friend-1']),
        },
      };

      // Mock getFriendsSockets to return the friend's socket
      (mockUserSocketService.getFriendsSockets as jest.Mock).mockResolvedValue([
        { userId: 'friend-1', socketId: 'friend-socket-id' },
      ]);

      const data: UserStatusDto = {
        appMetadata: {
          localized: null,
          unlocalized: 'VS Code',
          appIconB64: null,
        },
        state: UserState.IDLE,
      };

      await gateway.handleClientReportUserStatus(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that message was emitted via WsNotificationService
      expect(mockWsNotificationService.emitToSocket).toHaveBeenCalledWith(
        'friend-socket-id',
        'friend-user-status',
        {
          userId: 'user-1',
          status: data,
        },
      );
    });

    it('should NOT emit if user has no active doll', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          activeDollId: null, // No doll
          friends: new Set(['friend-1']),
        },
      };

      const data: UserStatusDto = {
        appMetadata: {
          localized: null,
          unlocalized: 'VS Code',
          appIconB64: null,
        },
        state: UserState.IDLE,
      };

      await gateway.handleClientReportUserStatus(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      expect(mockWsNotificationService.emitToSocket).not.toHaveBeenCalled();
    });

    it('should return early when userId is missing (not initialized)', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          // userId is missing
          friends: new Set(['friend-1']),
        },
      };

      const data: UserStatusDto = {
        appMetadata: {
          localized: null,
          unlocalized: 'VS Code',
          appIconB64: null,
        },
        state: UserState.IDLE,
      };

      await gateway.handleClientReportUserStatus(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that no message was emitted
      expect(mockWsNotificationService.emitToSocket).not.toHaveBeenCalled();
    });

    it('should throw exception when client is not authenticated', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
      };
      const data: UserStatusDto = {
        appMetadata: {
          localized: null,
          unlocalized: 'VS Code',
          appIconB64: null,
        },
        state: UserState.IDLE,
      };

      await expect(
        gateway.handleClientReportUserStatus(
          mockClient as unknown as AuthenticatedSocket,
          data,
        ),
      ).rejects.toThrow('Unauthorized');
    });

    it('should throttle broadcasts to prevent spam', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          activeDollId: 'doll-1',
          friends: new Set(['friend-1']),
        },
      };

      // Mock getFriendsSockets to return the friend's socket
      (mockUserSocketService.getFriendsSockets as jest.Mock).mockResolvedValue([
        { userId: 'friend-1', socketId: 'friend-socket-id' },
      ]);

      const data: UserStatusDto = {
        appMetadata: {
          localized: null,
          unlocalized: 'VS Code',
          appIconB64: null,
        },
        state: UserState.IDLE,
      };

      // First call should succeed
      await gateway.handleClientReportUserStatus(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Second call immediately after should be throttled
      await gateway.handleClientReportUserStatus(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that message was emitted only once (throttled)
      expect(mockWsNotificationService.emitToSocket).toHaveBeenCalledTimes(1);
      expect(mockWsNotificationService.emitToSocket).toHaveBeenCalledWith(
        'friend-socket-id',
        'friend-user-status',
        {
          userId: 'user-1',
          status: data,
        },
      );
    });
  });

  describe('handleSendInteraction', () => {
    it('should send interaction to friend if online', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub', name: 'TestUser' },
          userId: 'user-1',
          friends: new Set(['friend-1']),
        },
        emit: jest.fn(),
      };

      const data: SendInteractionDto = {
        recipientUserId: 'friend-1',
        content: 'hello',
        type: 'text',
      };

      (mockUserSocketService.isUserOnline as jest.Mock).mockResolvedValue(true);

      await gateway.handleSendInteraction(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      expect(mockWsNotificationService.emitToUser).toHaveBeenCalledWith(
        'friend-1',
        'interaction-received',
        expect.objectContaining({
          senderUserId: 'user-1',
          senderName: 'TestUser',
          content: 'hello',
          type: 'text',
        }),
      );
    });

    it('should fail if recipient is not a friend', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          friends: new Set(['friend-1']),
        },
        emit: jest.fn(),
      };

      const data: SendInteractionDto = {
        recipientUserId: 'stranger-1',
        content: 'hello',
        type: 'text',
      };

      await gateway.handleSendInteraction(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      expect(mockClient.emit).toHaveBeenCalledWith(
        'interaction-delivery-failed',
        expect.objectContaining({
          reason: 'Recipient is not a friend',
        }),
      );
      expect(mockWsNotificationService.emitToUser).not.toHaveBeenCalled();
    });

    it('should fail if recipient is offline', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          friends: new Set(['friend-1']),
        },
        emit: jest.fn(),
      };

      const data: SendInteractionDto = {
        recipientUserId: 'friend-1',
        content: 'hello',
        type: 'text',
      };

      (mockUserSocketService.isUserOnline as jest.Mock).mockResolvedValue(
        false,
      );

      await gateway.handleSendInteraction(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      expect(mockClient.emit).toHaveBeenCalledWith(
        'interaction-delivery-failed',
        expect.objectContaining({
          reason: 'Recipient is offline',
        }),
      );
      expect(mockWsNotificationService.emitToUser).not.toHaveBeenCalled();
    });

    it('should throw Unauthorized if user not initialized', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          // Missing user/userId
        },
      };

      const data: SendInteractionDto = {
        recipientUserId: 'friend-1',
        content: 'hello',
        type: 'text',
      };

      await expect(
        gateway.handleSendInteraction(
          mockClient as unknown as AuthenticatedSocket,
          data,
        ),
      ).rejects.toThrow(WsException);
    });
  });
});
