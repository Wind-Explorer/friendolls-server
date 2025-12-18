import { CursorPositionDto } from '../dto/cursor-position.dto';
import { Test, TestingModule } from '@nestjs/testing';
import { StateGateway } from './state.gateway';
import { AuthenticatedSocket } from '../../types/socket';
import { AuthService } from '../../auth/auth.service';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';
import { PrismaService } from '../../database/prisma.service';

interface MockSocket extends Partial<AuthenticatedSocket> {
  id: string;
  data: {
    user?: {
      keycloakSub: string;
    };
    userId?: string;
    friends?: Set<string>;
  };
  handshake?: any;
  disconnect?: jest.Mock;
}

describe('StateGateway', () => {
  let gateway: StateGateway;
  let mockLoggerLog: jest.SpyInstance;
  let mockLoggerDebug: jest.SpyInstance;
  let mockLoggerWarn: jest.SpyInstance;
  let mockServer: {
    sockets: { sockets: { size: number; get: jest.Mock } };
    to: jest.Mock;
  };
  let mockAuthService: Partial<AuthService>;
  let mockJwtVerificationService: Partial<JwtVerificationService>;
  let mockPrismaService: Partial<PrismaService>;

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
      friendship: {
        findMany: jest.fn().mockResolvedValue([]),
      },
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
      ],
    }).compile();

    gateway = module.get<StateGateway>(StateGateway);
    gateway.io = mockServer as any;

    mockLoggerLog = jest.spyOn(gateway['logger'], 'log').mockImplementation();
    mockLoggerDebug = jest
      .spyOn(gateway['logger'], 'debug')
      .mockImplementation();
    mockLoggerWarn = jest.spyOn(gateway['logger'], 'warn').mockImplementation();
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
  });

  describe('handleConnection', () => {
    it('should log client connection and sync user when authenticated', async () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: { user: { keycloakSub: 'test-sub' } },
        handshake: {
          auth: { token: 'mock-token' },
          headers: {},
        },
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
      expect(mockAuthService.syncUserFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakSub: 'test-sub',
        }),
      );
      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Client id: ${mockClient.id} connected (user: test-sub)`,
      );
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Number of connected clients: 5',
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

  describe('handleDisconnect', () => {
    it('should log client disconnection', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: { user: { keycloakSub: 'test-sub' } },
      };

      gateway.handleDisconnect(mockClient as unknown as AuthenticatedSocket);

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Client id: ${mockClient.id} disconnected (user: test-sub)`,
      );
    });

    it('should handle disconnection when no user data', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
      };

      gateway.handleDisconnect(mockClient as unknown as AuthenticatedSocket);

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Client id: ${mockClient.id} disconnected (user: unknown)`,
      );
    });
  });

  describe('handleCursorReportPosition', () => {
    it('should emit cursor position to connected friends', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          friends: new Set(['friend-1']),
        },
      };

      // Setup the userSocketMap to simulate a connected friend
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (gateway as any).userSocketMap.set('friend-1', 'friend-socket-id');

      const data: CursorPositionDto = { x: 100, y: 200 };

      gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that the message was emitted to the friend
      expect(mockServer.to).toHaveBeenCalledWith('friend-socket-id');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const emitMock = mockServer.to().emit as jest.Mock;
      expect(emitMock).toHaveBeenCalledWith('friend-cursor-position', {
        userId: 'user-1',
        position: data,
      });
    });

    it('should not emit when no friends are online', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          userId: 'user-1',
          friends: new Set(['friend-1']),
        },
      };

      // Don't set up userSocketMap - friend is not online
      const data: CursorPositionDto = { x: 100, y: 200 };

      gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that no message was emitted
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should log warning when userId is missing', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {
          user: { keycloakSub: 'test-sub' },
          // userId is missing
          friends: new Set(['friend-1']),
        },
      };

      const data: CursorPositionDto = { x: 100, y: 200 };

      gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      // Verify that a warning was logged
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        `Could not find user ID for client ${mockClient.id}`,
      );
      // Verify that no message was emitted
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should throw exception when client is not authenticated', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
      };
      const data: CursorPositionDto = { x: 100, y: 200 };

      expect(() => {
        gateway.handleCursorReportPosition(
          mockClient as unknown as AuthenticatedSocket,
          data,
        );
      }).toThrow('Unauthorized');
    });
  });
});
