import { Test, TestingModule } from '@nestjs/testing';
import { StateGateway } from './state.gateway';
import { Socket } from 'socket.io';

describe('StateGateway', () => {
  let gateway: StateGateway;
  let mockLoggerLog: jest.SpyInstance;
  let mockLoggerDebug: jest.SpyInstance;
  let mockServer: any;

  beforeEach(async () => {
    mockServer = {
      sockets: {
        sockets: {
          size: 5,
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StateGateway],
    }).compile();

    gateway = module.get<StateGateway>(StateGateway);
    gateway.io = mockServer;

    // Spy on logger methods
    mockLoggerLog = jest
      // gateway is private in `state.gateway.ts` so we have to
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .spyOn((gateway as any).logger, 'log')
      .mockImplementation();
    mockLoggerDebug = jest
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .spyOn((gateway as any).logger, 'debug')
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
  });

  describe('handleConnection', () => {
    it('should log client connection and number of connected clients', () => {
      const mockClient = { id: 'client1' } as Socket;

      gateway.handleConnection(mockClient);

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Client id: ${mockClient.id} connected`,
      );
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Number of connected clients: 5',
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should log client disconnection', () => {
      const mockClient = { id: 'client1' } as Socket;

      gateway.handleDisconnect(mockClient);

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Cliend id:${mockClient.id} disconnected`,
      );
    });
  });

  describe('handleCursorReportPosition', () => {
    it('should log message received from client', () => {
      const mockClient = { id: 'client1' } as Socket;
      const data = { x: 100, y: 200 };

      gateway.handleCursorReportPosition(mockClient, data);

      expect(mockLoggerLog).toHaveBeenCalledWith(
        `Message received from client id: ${mockClient.id}`,
      );
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        `Payload: ${JSON.stringify(data, null, 0)}`,
      );
    });
  });
});
