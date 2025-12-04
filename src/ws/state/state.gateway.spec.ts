import { Test, TestingModule } from '@nestjs/testing';
import { StateGateway } from './state.gateway';
import { AuthenticatedSocket } from '../../types/socket';
import { AuthService } from '../../auth/auth.service';
import { JwtVerificationService } from '../../auth/services/jwt-verification.service';

interface MockSocket extends Partial<AuthenticatedSocket> {
  id: string;
  data: {
    user?: {
      keycloakSub: string;
    };
  };
  handshake?: any;
  disconnect?: jest.Mock;
}

describe('StateGateway', () => {
  let gateway: StateGateway;
  let mockLoggerLog: jest.SpyInstance;
  let mockLoggerDebug: jest.SpyInstance;
  let mockLoggerWarn: jest.SpyInstance;
  let mockServer: { sockets: { sockets: { size: number } } };
  let mockAuthService: Partial<AuthService>;
  let mockJwtVerificationService: Partial<JwtVerificationService>;

  beforeEach(async () => {
    mockServer = {
      sockets: {
        sockets: {
          size: 5,
        },
      },
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateGateway,
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: JwtVerificationService,
          useValue: mockJwtVerificationService,
        },
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
    it('should log message received from authenticated client', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: { user: { keycloakSub: 'test-sub' } },
      };
      const data = { x: 100, y: 200 };

      gateway.handleCursorReportPosition(
        mockClient as unknown as AuthenticatedSocket,
        data,
      );

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Message received from client id: ${mockClient.id} (user: test-sub)`,
      );
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        `Payload: ${JSON.stringify(data, null, 0)}`,
      );
    });

    it('should throw exception when client is not authenticated', () => {
      const mockClient: MockSocket = {
        id: 'client1',
        data: {},
      };
      const data = { x: 100, y: 200 };

      expect(() => {
        gateway.handleCursorReportPosition(
          mockClient as unknown as AuthenticatedSocket,
          data,
        );
      }).toThrow('Unauthorized');
    });
  });
});
