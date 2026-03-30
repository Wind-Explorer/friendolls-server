import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { decode, sign } from 'jsonwebtoken';
import { CacheService } from '../common/cache/cache.service';
import { CacheTagsService } from '../common/cache/cache-tags.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { sha256 } from './auth.utils';
import type { SocialAuthProfile } from './types/social-auth-profile';

describe('AuthService', () => {
  let service: AuthService;

  const applyDefaultConfig = () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string | undefined> = {
        JWT_SECRET: 'test-secret',
        JWT_ISSUER: 'friendolls',
        JWT_AUDIENCE: 'friendolls-api',
        JWT_EXPIRES_IN_SECONDS: '3600',
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/sso/google/callback',
        DISCORD_CLIENT_ID: 'discord-client-id',
        DISCORD_CLIENT_SECRET: 'discord-client-secret',
        DISCORD_CALLBACK_URL: 'http://localhost:3000/auth/sso/discord/callback',
      };

      return config[key];
    });
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPrismaService = {
    authExchangeCode: {
      create: jest.fn(),
    },
    authIdentity: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    getNamespacedKey: jest
      .fn()
      .mockImplementation(
        (namespace: string, key: string) => `friendolls:${namespace}:${key}`,
      ),
    recordError: jest.fn(),
  };

  const mockCacheTagsService = {
    rememberKeyForTag: jest.fn().mockResolvedValue(undefined),
    invalidateTag: jest.fn().mockResolvedValue(undefined),
  };

  const socialProfile: SocialAuthProfile = {
    provider: 'google',
    providerSubject: 'google-user-123',
    email: 'jane@example.com',
    emailVerified: true,
    displayName: 'Jane Example',
    username: 'jane',
    picture: 'https://example.com/jane.png',
  };

  const createRefreshToken = (overrides: Record<string, unknown> = {}) =>
    sign(
      {
        sub: 'user-1',
        sid: 'session-1',
        jti: 'refresh-jti',
        typ: 'refresh',
        ...overrides,
      },
      'test-secret',
      {
        issuer: 'friendolls',
        audience: 'friendolls-api',
        expiresIn: 60,
        algorithm: 'HS256',
      },
    );

  beforeEach(async () => {
    applyDefaultConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: CacheService, useValue: mockCacheService },
        { provide: CacheTagsService, useValue: mockCacheTagsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    applyDefaultConfig();
  });

  describe('startSso', () => {
    it('returns a signed state token for configured providers', () => {
      const result = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      );

      expect(result.state).toEqual(expect.any(String));
    });

    it('rejects unconfigured providers', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key.startsWith('GOOGLE_')) {
          return undefined;
        }

        const config: Record<string, string | undefined> = {
          JWT_SECRET: 'test-secret',
          JWT_ISSUER: 'friendolls',
          JWT_AUDIENCE: 'friendolls-api',
          JWT_EXPIRES_IN_SECONDS: '3600',
          DISCORD_CLIENT_ID: 'discord-client-id',
          DISCORD_CLIENT_SECRET: 'discord-client-secret',
          DISCORD_CALLBACK_URL:
            'http://localhost:3000/auth/sso/discord/callback',
        };

        return config[key];
      });

      const localService = new AuthService(
        mockPrismaService as unknown as PrismaService,
        mockConfigService as unknown as ConfigService,
        mockEventEmitter as unknown as EventEmitter2,
        mockCacheService as unknown as CacheService,
        mockCacheTagsService as unknown as CacheTagsService,
      );

      expect(() =>
        localService.startSso('google', 'http://127.0.0.1:43123/callback'),
      ).toThrow(ServiceUnavailableException);
    });
  });

  describe('exchangeSsoCode', () => {
    it('throws when the exchange code was already consumed', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]);

      await expect(service.exchangeSsoCode('used-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshTokens', () => {
    it('throws unauthorized on malformed refresh token', async () => {
      await expect(service.refreshTokens('not-a-jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes the session when a stale refresh token is replayed', async () => {
      const refreshToken = createRefreshToken();

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'session-1',
            refresh_token_hash: 'different-hash',
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            provider: 'GOOGLE',
            user_id: 'user-1',
            email: 'jane@example.com',
            roles: ['user'],
          },
        ])
        .mockResolvedValueOnce([{ id: 'session-1' }]);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('issues a distinct refresh token on rotation', async () => {
      const refreshToken = createRefreshToken();

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'session-1',
            refresh_token_hash: sha256(refreshToken),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            provider: 'GOOGLE',
            user_id: 'user-1',
            email: 'jane@example.com',
            roles: ['user'],
          },
        ])
        .mockResolvedValueOnce([{ id: 'session-1' }]);

      const result = await service.refreshTokens(refreshToken);

      expect(result.refreshToken).not.toBe(refreshToken);
      const payload = decode(result.refreshToken) as { jti?: string } | null;
      expect(payload?.jti).toEqual(expect.any(String));
    });

    it('throws when refresh rotation loses the race', async () => {
      const refreshToken = createRefreshToken();

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'session-1',
            refresh_token_hash: sha256(refreshToken),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            provider: 'GOOGLE',
            user_id: 'user-1',
            email: 'jane@example.com',
            roles: ['user'],
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'session-1' }]);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('completeSso', () => {
    it('creates a new account when the provider email is verified', async () => {
      const state = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      ).state;
      const createdUser = {
        id: 'user-1',
        email: 'jane@example.com',
        name: 'Jane Example',
        username: 'jane',
        picture: 'https://example.com/jane.png',
        roles: [],
        keycloakSub: null,
        passwordHash: null,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        activeDollId: null,
      };
      const txUserCreate = jest.fn().mockResolvedValue(createdUser);

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation((callback) =>
        Promise.resolve(
          callback({
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: txUserCreate,
            },
            authIdentity: {
              create: jest.fn().mockResolvedValue(undefined),
            },
          }),
        ),
      );
      mockPrismaService.authExchangeCode.create.mockResolvedValue({
        id: 'code-1',
      });

      const redirectUri = await service.completeSso(
        'google',
        state,
        socialProfile,
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(txUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'jane@example.com',
        }),
      });
      expect(mockPrismaService.authExchangeCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'GOOGLE',
          userId: 'user-1',
        }),
      });
      expect(redirectUri).toContain('http://127.0.0.1:43123/callback');
      expect(redirectUri).toContain('code=');
    });

    it('rejects creating an account when provider email is unverified', async () => {
      const state = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      ).state;
      const unverifiedProfile: SocialAuthProfile = {
        ...socialProfile,
        emailVerified: false,
      };

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);

      await expect(
        service.completeSso('google', state, unverifiedProfile),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects auto-linking to an existing local account', async () => {
      const state = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      ).state;

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation((callback) =>
        Promise.resolve(
          callback({
            user: {
              findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
              create: jest.fn(),
            },
            authIdentity: {
              create: jest.fn(),
            },
          }),
        ),
      );

      await expect(
        service.completeSso('google', state, socialProfile),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows an existing linked identity to sign in without an email', async () => {
      const state = service.startSso(
        'discord',
        'http://127.0.0.1:43123/callback',
      ).state;
      const linkedUser = {
        id: 'user-1',
        email: 'jane@example.com',
        name: 'Jane Example',
        username: 'jane',
        picture: 'https://example.com/jane.png',
        roles: ['user'],
        keycloakSub: null,
        passwordHash: null,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        activeDollId: null,
      };

      mockPrismaService.authIdentity.findUnique.mockResolvedValue({
        id: 'identity-1',
        user: linkedUser,
      });
      mockPrismaService.authIdentity.update.mockResolvedValue(undefined);
      mockPrismaService.user.update.mockResolvedValue(linkedUser);
      mockPrismaService.authExchangeCode.create.mockResolvedValue({
        id: 'code-1',
      });

      const redirectUri = await service.completeSso('discord', state, {
        provider: 'discord',
        providerSubject: 'google-user-123',
        email: null,
        emailVerified: false,
        displayName: 'Jane Example',
        username: 'jane',
      });

      expect(redirectUri).toContain('code=');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.not.objectContaining({ email: expect.anything() }),
      });
    });

    it('normalizes provider emails before creating users and identities', async () => {
      const state = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      ).state;
      const mixedCaseProfile: SocialAuthProfile = {
        ...socialProfile,
        email: ' Jane@Example.COM ',
      };

      const txUserCreate = jest.fn().mockResolvedValue({ id: 'user-1' });
      const txIdentityCreate = jest.fn().mockResolvedValue(undefined);

      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation((callback) =>
        Promise.resolve(
          callback({
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: txUserCreate,
            },
            authIdentity: {
              create: txIdentityCreate,
            },
          }),
        ),
      );
      mockPrismaService.authExchangeCode.create.mockResolvedValue({
        id: 'code-1',
      });

      await service.completeSso('google', state, mixedCaseProfile);

      expect(txUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'jane@example.com' }),
      });
      expect(txIdentityCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ providerEmail: 'jane@example.com' }),
      });
    });

    it('derives username from email local-part when provider username is missing', async () => {
      const state = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      ).state;
      const profileWithoutUsername: SocialAuthProfile = {
        ...socialProfile,
        email: 'Alice@example.com',
        username: undefined,
      };

      const txUserCreate = jest.fn().mockResolvedValue({ id: 'user-1' });
      const txIdentityCreate = jest.fn().mockResolvedValue(undefined);
      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findFirst = jest.fn().mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation((callback) =>
        Promise.resolve(
          callback({
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: txUserCreate,
            },
            authIdentity: {
              create: txIdentityCreate,
            },
          }),
        ),
      );
      mockPrismaService.authExchangeCode.create.mockResolvedValue({
        id: 'code-1',
      });

      await service.completeSso('google', state, profileWithoutUsername);

      expect(txUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ username: 'alice' }),
      });
      expect(txIdentityCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ providerUsername: 'alice' }),
      });
    });

    it('adds a numeric suffix when derived username is already taken', async () => {
      const state = service.startSso(
        'google',
        'http://127.0.0.1:43123/callback',
      ).state;
      const profileWithoutUsername: SocialAuthProfile = {
        ...socialProfile,
        email: 'Alice@example.com',
        username: undefined,
      };

      const txUserCreate = jest.fn().mockResolvedValue({ id: 'user-1' });
      const txIdentityCreate = jest.fn().mockResolvedValue(undefined);
      mockPrismaService.authIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'existing-user' })
        .mockResolvedValueOnce(null);
      mockPrismaService.$transaction.mockImplementation((callback) =>
        Promise.resolve(
          callback({
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: txUserCreate,
            },
            authIdentity: {
              create: txIdentityCreate,
            },
          }),
        ),
      );
      mockPrismaService.authExchangeCode.create.mockResolvedValue({
        id: 'code-1',
      });

      await service.completeSso('google', state, profileWithoutUsername);

      expect(txUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ username: 'alice2' }),
      });
    });
  });
});
