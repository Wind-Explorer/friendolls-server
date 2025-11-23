import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { User } from '../users/users.entity';

describe('AuthService', () => {
  let service: AuthService;

  const mockFindByKeycloakSub = jest.fn();
  const mockUpdateFromToken = jest.fn();
  const mockCreateFromToken = jest.fn();

  const mockUsersService = {
    findByKeycloakSub: mockFindByKeycloakSub,
    updateFromToken: mockUpdateFromToken,
    createFromToken: mockCreateFromToken,
  };

  const mockAuthUser: AuthenticatedUser = {
    keycloakSub: 'f:realm:user123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    picture: 'https://example.com/avatar.jpg',
    roles: ['user', 'premium'],
  };

  const mockUser: User = {
    id: 'uuid-123',
    keycloakSub: 'f:realm:user123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    picture: 'https://example.com/avatar.jpg',
    roles: ['user', 'premium'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastLoginAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncUserFromToken', () => {
    it('should create a new user if user does not exist', async () => {
      mockFindByKeycloakSub.mockReturnValue(null);
      mockCreateFromToken.mockReturnValue(mockUser);

      const result = await service.syncUserFromToken(mockAuthUser);

      expect(result).toEqual(mockUser);
      expect(mockFindByKeycloakSub).toHaveBeenCalledWith('f:realm:user123');
      expect(mockCreateFromToken).toHaveBeenCalledWith({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium'],
      });
      expect(mockUpdateFromToken).not.toHaveBeenCalled();
    });

    it('should update existing user if user exists', async () => {
      const updatedUser = { ...mockUser, lastLoginAt: new Date('2024-02-01') };
      mockFindByKeycloakSub.mockReturnValue(mockUser);
      mockUpdateFromToken.mockReturnValue(updatedUser);

      const result = await service.syncUserFromToken(mockAuthUser);

      expect(result).toEqual(updatedUser);
      expect(mockFindByKeycloakSub).toHaveBeenCalledWith('f:realm:user123');

      expect(mockUpdateFromToken).toHaveBeenCalledWith(
        'f:realm:user123',
        expect.objectContaining({
          email: 'test@example.com',
          name: 'Test User',
          username: 'testuser',
          picture: 'https://example.com/avatar.jpg',
          roles: ['user', 'premium'],

          lastLoginAt: expect.any(Date),
        }),
      );
      expect(mockCreateFromToken).not.toHaveBeenCalled();
    });

    it('should handle user with no email by using empty string', async () => {
      const authUserNoEmail: AuthenticatedUser = {
        keycloakSub: 'f:realm:user456',
        name: 'No Email User',
      };

      mockFindByKeycloakSub.mockReturnValue(null);
      mockCreateFromToken.mockReturnValue({
        ...mockUser,
        email: '',
        name: 'No Email User',
      });

      await service.syncUserFromToken(authUserNoEmail);

      expect(mockCreateFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          email: '',
          name: 'No Email User',
        }),
      );
    });

    it('should handle user with no name by using username or fallback', async () => {
      const authUserNoName: AuthenticatedUser = {
        keycloakSub: 'f:realm:user789',
        username: 'someusername',
      };

      mockFindByKeycloakSub.mockReturnValue(null);
      mockCreateFromToken.mockReturnValue({
        ...mockUser,
        name: 'someusername',
      });

      await service.syncUserFromToken(authUserNoName);

      expect(mockCreateFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'someusername',
        }),
      );
    });

    it('should use "Unknown User" when no name or username is available', async () => {
      const authUserMinimal: AuthenticatedUser = {
        keycloakSub: 'f:realm:user000',
      };

      mockFindByKeycloakSub.mockReturnValue(null);
      mockCreateFromToken.mockReturnValue({
        ...mockUser,
        name: 'Unknown User',
      });

      await service.syncUserFromToken(authUserMinimal);

      expect(mockCreateFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unknown User',
        }),
      );
    });

    it('should handle empty keycloakSub gracefully', async () => {
      const authUserEmptySub: AuthenticatedUser = {
        keycloakSub: '',
        email: 'empty@example.com',
        name: 'Empty Sub User',
      };

      mockFindByKeycloakSub.mockReturnValue(null);
      mockCreateFromToken.mockReturnValue({
        ...mockUser,
        keycloakSub: '',
        email: 'empty@example.com',
        name: 'Empty Sub User',
      });

      const result = await service.syncUserFromToken(authUserEmptySub);

      expect(mockFindByKeycloakSub).toHaveBeenCalledWith('');
      expect(mockCreateFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakSub: '',
          email: 'empty@example.com',
          name: 'Empty Sub User',
        }),
      );
    });

    it('should handle malformed keycloakSub', async () => {
      const authUserMalformed: AuthenticatedUser = {
        keycloakSub: 'invalid-format',
        email: 'malformed@example.com',
        name: 'Malformed User',
      };

      mockFindByKeycloakSub.mockReturnValue(null);
      mockCreateFromToken.mockReturnValue({
        ...mockUser,
        keycloakSub: 'invalid-format',
        email: 'malformed@example.com',
        name: 'Malformed User',
      });

      const result = await service.syncUserFromToken(authUserMalformed);

      expect(mockFindByKeycloakSub).toHaveBeenCalledWith('invalid-format');
      expect(mockCreateFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakSub: 'invalid-format',
          email: 'malformed@example.com',
          name: 'Malformed User',
        }),
      );
    });
  });

  describe('hasRole', () => {
    it('should return true if user has the required role', () => {
      const result = service.hasRole(mockAuthUser, 'user');

      expect(result).toBe(true);
    });

    it('should return false if user does not have the required role', () => {
      const result = service.hasRole(mockAuthUser, 'admin');

      expect(result).toBe(false);
    });

    it('should return false if user has no roles', () => {
      const authUserNoRoles: AuthenticatedUser = {
        keycloakSub: 'f:realm:noroles',
        email: 'noroles@example.com',
        name: 'No Roles User',
      };

      const result = service.hasRole(authUserNoRoles, 'user');

      expect(result).toBe(false);
    });

    it('should return false if user roles is empty array', () => {
      const authUserEmptyRoles: AuthenticatedUser = {
        keycloakSub: 'f:realm:emptyroles',
        email: 'empty@example.com',
        name: 'Empty Roles User',
        roles: [],
      };

      const result = service.hasRole(authUserEmptyRoles, 'user');

      expect(result).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true if user has at least one of the required roles', () => {
      const result = service.hasAnyRole(mockAuthUser, ['admin', 'premium']);

      expect(result).toBe(true);
    });

    it('should return false if user has none of the required roles', () => {
      const result = service.hasAnyRole(mockAuthUser, ['admin', 'moderator']);

      expect(result).toBe(false);
    });

    it('should return false if user has no roles', () => {
      const authUserNoRoles: AuthenticatedUser = {
        keycloakSub: 'f:realm:noroles',
        email: 'noroles@example.com',
        name: 'No Roles User',
      };

      const result = service.hasAnyRole(authUserNoRoles, ['admin', 'user']);

      expect(result).toBe(false);
    });

    it('should return false if user roles is empty array', () => {
      const authUserEmptyRoles: AuthenticatedUser = {
        keycloakSub: 'f:realm:emptyroles',
        email: 'empty@example.com',
        name: 'Empty Roles User',
        roles: [],
      };

      const result = service.hasAnyRole(authUserEmptyRoles, ['admin', 'user']);

      expect(result).toBe(false);
    });

    it('should handle multiple matching roles', () => {
      const result = service.hasAnyRole(mockAuthUser, ['user', 'premium']);

      expect(result).toBe(true);
    });
  });

  describe('hasAllRoles', () => {
    it('should return true if user has all of the required roles', () => {
      const result = service.hasAllRoles(mockAuthUser, ['user', 'premium']);

      expect(result).toBe(true);
    });

    it('should return false if user has only some of the required roles', () => {
      const result = service.hasAllRoles(mockAuthUser, [
        'user',
        'premium',
        'admin',
      ]);

      expect(result).toBe(false);
    });

    it('should return false if user has none of the required roles', () => {
      const result = service.hasAllRoles(mockAuthUser, ['admin', 'moderator']);

      expect(result).toBe(false);
    });

    it('should return false if user has no roles', () => {
      const authUserNoRoles: AuthenticatedUser = {
        keycloakSub: 'f:realm:noroles',
        email: 'noroles@example.com',
        name: 'No Roles User',
      };

      const result = service.hasAllRoles(authUserNoRoles, ['user']);

      expect(result).toBe(false);
    });

    it('should return false if user roles is empty array', () => {
      const authUserEmptyRoles: AuthenticatedUser = {
        keycloakSub: 'f:realm:emptyroles',
        email: 'empty@example.com',
        name: 'Empty Roles User',
        roles: [],
      };

      const result = service.hasAllRoles(authUserEmptyRoles, ['user']);

      expect(result).toBe(false);
    });

    it('should return true for single role check', () => {
      const result = service.hasAllRoles(mockAuthUser, ['user']);

      expect(result).toBe(true);
    });
  });
});
