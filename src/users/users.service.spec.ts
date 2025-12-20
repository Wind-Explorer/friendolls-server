import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

describe('UsersService', () => {
  let service: UsersService;

  const mockUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    keycloakSub: 'f:realm:user123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    picture: 'https://example.com/avatar.jpg',
    roles: ['user', 'premium'],
    lastLoginAt: new Date('2024-01-15T10:30:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    activeDollId: null,
  };

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFromToken', () => {
    it('should create a new user when user does not exist', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:newuser',
        email: 'john@example.com',
        name: 'John Doe',
        username: 'johndoe',
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium'],
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.upsert.mockResolvedValue({
        ...mockUser,
        ...tokenData,
      });

      const user = await service.createFromToken(tokenData);

      expect(user).toBeDefined();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
      });
      expect(mockPrismaService.user.upsert).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        update: expect.objectContaining({
          email: tokenData.email,
          name: tokenData.name,
          username: tokenData.username,
          picture: tokenData.picture,
          roles: tokenData.roles,
          lastLoginAt: expect.any(Date),
        }),
        create: expect.objectContaining({
          keycloakSub: tokenData.keycloakSub,
          email: tokenData.email,
          name: tokenData.name,
          username: tokenData.username,
          picture: tokenData.picture,
          roles: tokenData.roles,
          lastLoginAt: expect.any(Date),
        }),
      });
    });

    it('should update all fields when profile data changed', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'newemail@example.com', // Changed
        name: 'New Name', // Changed
        username: 'testuser',
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium'],
      };

      const existingUser = { ...mockUser };
      const updatedUser = {
        ...mockUser,
        email: tokenData.email,
        name: tokenData.name,
        lastLoginAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toEqual(updatedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        data: {
          email: tokenData.email,
          name: tokenData.name,
          username: tokenData.username,
          picture: tokenData.picture,
          roles: tokenData.roles,
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it('should only update lastLoginAt when profile unchanged', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com', // Same
        name: 'Test User', // Same
        username: 'testuser', // Same
        picture: 'https://example.com/avatar.jpg', // Same
        roles: ['user', 'premium'], // Same
      };

      const existingUser = { ...mockUser };
      const updatedUser = {
        ...mockUser,
        lastLoginAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        data: {
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it('should detect role changes and update profile', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium', 'admin'], // Changed: added admin
      };

      const existingUser = { ...mockUser };
      const updatedUser = {
        ...mockUser,
        roles: tokenData.roles,
        lastLoginAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        data: {
          email: tokenData.email,
          name: tokenData.name,
          username: tokenData.username,
          picture: tokenData.picture,
          roles: tokenData.roles,
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it('should handle optional fields when creating new user', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user456',
        email: 'jane@example.com',
        name: 'Jane Doe',
      };

      const newUser = { ...mockUser, username: null, picture: null, roles: [] };
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.upsert.mockResolvedValue(newUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toBeDefined();
      expect(mockPrismaService.user.upsert).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        update: expect.objectContaining({
          email: tokenData.email,
          name: tokenData.name,
          username: undefined,
          picture: undefined,
          roles: [],
          lastLoginAt: expect.any(Date),
        }),
        create: expect.objectContaining({
          keycloakSub: tokenData.keycloakSub,
          email: tokenData.email,
          name: tokenData.name,
          username: undefined,
          picture: undefined,
          roles: [],
        }),
      });
    });

    it('should normalize empty roles array', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
        roles: undefined,
      };

      const existingUser = { ...mockUser, roles: ['user'] };
      const updatedUser = { ...mockUser, roles: [] };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      await service.createFromToken(tokenData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        data: expect.objectContaining({
          roles: [],
        }),
      });
    });

    it('should detect username change', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
        username: 'newusername', // Changed
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium'],
      };

      const existingUser = { ...mockUser };
      const updatedUser = { ...mockUser, username: 'newusername' };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      await service.createFromToken(tokenData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        data: expect.objectContaining({
          username: 'newusername',
        }),
      });
    });

    it('should detect picture change', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        picture: 'https://example.com/new-avatar.jpg', // Changed
        roles: ['user', 'premium'],
      };

      const existingUser = { ...mockUser };
      const updatedUser = {
        ...mockUser,
        picture: 'https://example.com/new-avatar.jpg',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      await service.createFromToken(tokenData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
        data: expect.objectContaining({
          picture: 'https://example.com/new-avatar.jpg',
        }),
      });
    });
  });

  describe('findByKeycloakSub', () => {
    it('should find a user by keycloakSub', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.findByKeycloakSub('f:realm:user123');

      expect(user).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
      });
    });

    it('should return null if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const user = await service.findByKeycloakSub('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should find a user by ID', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.findOne(mockUser.id);

      expect(user).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      const nonexistentId = '550e8400-0000-0000-0000-000000000000';
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(nonexistentId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(nonexistentId)).rejects.toThrow(
        `User with ID ${nonexistentId} not found`,
      );
    });
  });

  describe('update', () => {
    it('should allow update but currently no fields are updatable', async () => {
      const updateDto: UpdateUserDto = {};

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const user = await service.update(
        mockUser.id,
        updateDto,
        mockUser.keycloakSub,
      );

      expect(user).toEqual(mockUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {},
      });
    });

    it('should throw ForbiddenException if user tries to update someone else', async () => {
      const updateDto: UpdateUserDto = {};

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.update(mockUser.id, updateDto, 'different-keycloak-sub'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const updateDto: UpdateUserDto = {};

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', updateDto, 'any-keycloak-sub'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete user account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      await service.delete(mockUser.id, mockUser.keycloakSub);

      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it('should throw ForbiddenException if user tries to delete someone else', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.delete(mockUser.id, 'different-keycloak-sub'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.delete('nonexistent', 'any-keycloak-sub'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('syncProfileFromToken', () => {
    it('should sync profile data from Keycloak token for existing user', async () => {
      const profileData = {
        email: 'updated@example.com',
        name: 'Updated Name',
        username: 'updateduser',
        picture: 'https://example.com/new-avatar.jpg',
        roles: ['user', 'admin'],
      };

      const updatedUser = { ...mockUser, ...profileData };
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.syncProfileFromToken(
        'f:realm:user123',
        profileData,
      );

      expect(user).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
        data: {
          email: profileData.email,
          name: profileData.name,
          username: profileData.username,
          picture: profileData.picture,
          roles: profileData.roles,
        },
      });
    });

    it('should handle profile data with missing optional fields', async () => {
      const profileData = {
        email: 'minimal@example.com',
        name: 'Minimal User',
      };

      const updatedUser = {
        ...mockUser,
        ...profileData,
        username: null,
        picture: null,
        roles: [],
      };
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.syncProfileFromToken(
        'f:realm:user123',
        profileData,
      );

      expect(user).toBeDefined();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
        data: {
          email: profileData.email,
          name: profileData.name,
          username: undefined,
          picture: undefined,
          roles: [],
        },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      const profileData = {
        email: 'test@example.com',
        name: 'Test User',
      };

      const prismaError = new PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );

      mockPrismaService.user.update.mockRejectedValue(prismaError);

      await expect(
        service.syncProfileFromToken('nonexistent', profileData),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.syncProfileFromToken('nonexistent', profileData),
      ).rejects.toThrow('User with keycloakSub nonexistent not found');
    });

    it('should normalize empty roles array', async () => {
      const profileData = {
        email: 'test@example.com',
        name: 'Test User',
        roles: undefined,
      };

      const updatedUser = { ...mockUser, roles: [] };
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      await service.syncProfileFromToken('f:realm:user123', profileData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
        data: expect.objectContaining({
          roles: [],
        }),
      });
    });

    it('should overwrite all profile fields from Keycloak', async () => {
      const profileData = {
        email: 'keycloak@example.com',
        name: 'Keycloak Name',
        username: 'keycloakuser',
        picture: 'https://keycloak.example.com/avatar.jpg',
        roles: ['external-role'],
      };

      const updatedUser = { ...mockUser, ...profileData };
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.syncProfileFromToken(
        'f:realm:user123',
        profileData,
      );

      expect(user.name).toBe('Keycloak Name');
      expect(user.email).toBe('keycloak@example.com');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
        data: {
          email: profileData.email,
          name: profileData.name,
          username: profileData.username,
          picture: profileData.picture,
          roles: profileData.roles,
        },
      });
    });

    it('should rethrow non-P2025 errors', async () => {
      const profileData = {
        email: 'test@example.com',
        name: 'Test User',
      };

      const dbError = new Error('Database connection failed');
      mockPrismaService.user.update.mockRejectedValue(dbError);

      await expect(
        service.syncProfileFromToken('f:realm:user123', profileData),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('searchUsers', () => {
    const users: User[] = [
      { ...mockUser, id: 'user1', username: 'alice' },
      { ...mockUser, id: 'user2', username: 'bob' },
      { ...mockUser, id: 'user3', username: 'charlie' },
    ];

    it('should search users by username (case-insensitive, partial match)', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([users[0]]);

      const result = await service.searchUsers('ALI');

      expect(result).toEqual([users[0]]);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          username: {
            contains: 'ALI',
            mode: 'insensitive',
          },
        },
        take: 20,
        orderBy: {
          username: 'asc',
        },
      });
    });

    it('should exclude specified user from results', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([users[1], users[2]]);

      const result = await service.searchUsers(undefined, 'user1');

      expect(result).toEqual([users[1], users[2]]);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            not: 'user1',
          },
        },
        take: 20,
        orderBy: {
          username: 'asc',
        },
      });
    });

    it('should combine username search with user exclusion', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([users[1]]);

      const result = await service.searchUsers('b', 'user1');

      expect(result).toEqual([users[1]]);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          username: {
            contains: 'b',
            mode: 'insensitive',
          },
          id: {
            not: 'user1',
          },
        },
        take: 20,
        orderBy: {
          username: 'asc',
        },
      });
    });

    it('should limit results to 20 users', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        ...mockUser,
        id: `user${i}`,
        username: `user${i}`,
      }));
      const limitedUsers = manyUsers.slice(0, 20);

      mockPrismaService.user.findMany.mockResolvedValue(limitedUsers);

      const result = await service.searchUsers();

      expect(result).toHaveLength(20);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 20,
        orderBy: {
          username: 'asc',
        },
      });
    });

    it('should return all users when no filters provided', async () => {
      mockPrismaService.user.findMany.mockResolvedValue(users);

      const result = await service.searchUsers();

      expect(result).toEqual(users);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {},
        take: 20,
        orderBy: {
          username: 'asc',
        },
      });
    });

    it('should return empty array when no matches found', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.searchUsers('nonexistent');

      expect(result).toEqual([]);
    });

    it('should order results by username ascending', async () => {
      const unorderedUsers = [users[2], users[0], users[1]];
      mockPrismaService.user.findMany.mockResolvedValue(unorderedUsers);

      await service.searchUsers();

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            username: 'asc',
          },
        }),
      );
    });
  });

  describe('active doll management', () => {
    const dollId = 'doll-123';
    const mockDoll = {
      id: dollId,
      name: 'Test Doll',
      configuration: {},
      userId: mockUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    describe('setActiveDoll', () => {
      it('should set active doll for user', async () => {
        const updatedUser = { ...mockUser, activeDollId: dollId };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        mockPrismaService.doll = { findUnique: jest.fn() };
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockPrismaService.doll.findUnique.mockResolvedValue(mockDoll);
        mockPrismaService.user.update.mockResolvedValue(updatedUser);

        const result = await service.setActiveDoll(
          mockUser.id,
          dollId,
          mockUser.keycloakSub,
        );

        expect(result).toEqual(updatedUser);
        expect(mockPrismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: { activeDollId: dollId },
          include: { activeDoll: true },
        });
      });

      it('should throw ForbiddenException if user tries to update another profile', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

        await expect(
          service.setActiveDoll(mockUser.id, dollId, 'other-keycloak-sub'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException if doll not found', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        mockPrismaService.doll = { findUnique: jest.fn() };
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockPrismaService.doll.findUnique.mockResolvedValue(null);

        await expect(
          service.setActiveDoll(mockUser.id, dollId, mockUser.keycloakSub),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw NotFoundException if doll is soft deleted', async () => {
        const deletedDoll = { ...mockDoll, deletedAt: new Date() };
        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        mockPrismaService.doll = { findUnique: jest.fn() };
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockPrismaService.doll.findUnique.mockResolvedValue(deletedDoll);

        await expect(
          service.setActiveDoll(mockUser.id, dollId, mockUser.keycloakSub),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException if doll belongs to another user', async () => {
        const otherUserDoll = { ...mockDoll, userId: 'other-user' };
        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        mockPrismaService.doll = { findUnique: jest.fn() };
        // @ts-expect-error - mockPrismaService type definition is incomplete in test file
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mockPrismaService.doll.findUnique.mockResolvedValue(otherUserDoll);

        await expect(
          service.setActiveDoll(mockUser.id, dollId, mockUser.keycloakSub),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('removeActiveDoll', () => {
      it('should remove active doll for user', async () => {
        const updatedUser = { ...mockUser, activeDollId: null };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPrismaService.user.update.mockResolvedValue(updatedUser);

        const result = await service.removeActiveDoll(
          mockUser.id,
          mockUser.keycloakSub,
        );

        expect(result).toEqual(updatedUser);
        expect(mockPrismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: { activeDollId: null },
        });
      });

      it('should throw ForbiddenException if user tries to update another profile', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

        await expect(
          service.removeActiveDoll(mockUser.id, 'other-keycloak-sub'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
