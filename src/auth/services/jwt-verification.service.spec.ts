import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtVerificationService } from './jwt-verification.service';

describe('JwtVerificationService', () => {
  let service: JwtVerificationService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          JWT_SECRET: 'test-secret',
          JWT_ISSUER: 'https://test.com',
          JWT_AUDIENCE: 'test-audience',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtVerificationService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<JwtVerificationService>(JwtVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractToken', () => {
    it('should extract token from auth object', () => {
      const handshake = {
        auth: { token: 'test-token' },
        headers: {},
      };

      const token = service.extractToken(handshake);

      expect(token).toBe('test-token');
    });

    it('should extract token from Authorization header', () => {
      const handshake = {
        auth: {},
        headers: { authorization: 'Bearer test-token' },
      };

      const token = service.extractToken(handshake);

      expect(token).toBe('test-token');
    });

    it('should prioritize auth.token over header', () => {
      const handshake = {
        auth: { token: 'auth-token' },
        headers: { authorization: 'Bearer header-token' },
      };

      const token = service.extractToken(handshake);

      expect(token).toBe('auth-token');
    });

    it('should return undefined when no token present', () => {
      const handshake = {
        auth: {},
        headers: {},
      };

      const token = service.extractToken(handshake);

      expect(token).toBeUndefined();
    });
  });
});
