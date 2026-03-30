import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../common/cache/cache.service';
import { CacheTagsService } from '../common/cache/cache-tags.service';

describe('UsersService', () => {
  let service: UsersService;
  let cacheService: CacheService;
  let cacheTagsService: CacheTagsService;

  const mockUser: User & { passwordHash?: string | null } = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    keycloakSub: 'f:realm:user123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    picture: 'https://example.com/avatar.jpg',
    roles: ['user', 'premium'],
    passwordHash: null,
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

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    getNamespacedKey: jest
      .fn()
      .mockImplementation(
        (namespace: string, key: string) => `friendolls:${namespace}:${key}`,
      ),
    recordError: jest.fn(),
  };

  const mockCacheTagsService = {
    rememberKeyForTag: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: CacheTagsService,
          useValue: mockCacheTagsService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    cacheService = module.get<CacheService>(CacheService);
    cacheTagsService = module.get<CacheTagsService>(CacheTagsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createLocalUser', () => {
    it('should create a local user with password hash', async () => {
      const dto = {
        email: 'john@example.com',
        name: 'John Doe',
        username: 'johndoe',
        passwordHash: 'hashed',
      };

      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const user = await service.createLocalUser(dto);

      expect(user).toBeDefined();
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: dto.email,
          name: dto.name,
          username: dto.username,
          passwordHash: dto.passwordHash,
        }),
      });
    });

    it('normalizes email before creating a local user', async () => {
      const dto = {
        email: ' John@Example.COM ',
        name: 'John Doe',
        username: 'johndoe',
        passwordHash: 'hashed',
      };

      mockPrismaService.user.create.mockResolvedValue(mockUser);

      await service.createLocalUser(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'john@example.com',
        }),
      });
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

      const user = await service.update(mockUser.id, updateDto, mockUser.id);

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
        service.update(mockUser.id, updateDto, 'different-user-id'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const updateDto: UpdateUserDto = {};

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', updateDto, 'any-user-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete user account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      await service.delete(mockUser.id, mockUser.id);

      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it('should throw ForbiddenException if user tries to delete someone else', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.delete(mockUser.id, 'different-user-id'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.delete('nonexistent', 'any-user-id'),
      ).rejects.toThrow(NotFoundException);
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
      expect(cacheService.set).toHaveBeenCalled();
      expect(cacheTagsService.rememberKeyForTag).toHaveBeenCalled();
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
          mockUser.id,
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
          service.setActiveDoll(mockUser.id, dollId, 'other-user-id'),
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
          service.setActiveDoll(mockUser.id, dollId, mockUser.id),
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
          service.setActiveDoll(mockUser.id, dollId, mockUser.id),
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
          service.setActiveDoll(mockUser.id, dollId, mockUser.id),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('removeActiveDoll', () => {
      it('should remove active doll for user', async () => {
        const updatedUser = { ...mockUser, activeDollId: null };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPrismaService.user.update.mockResolvedValue(updatedUser);

        const result = await service.removeActiveDoll(mockUser.id, mockUser.id);

        expect(result).toEqual(updatedUser);
        expect(mockPrismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: { activeDollId: null },
        });
      });

      it('should throw ForbiddenException if user tries to update another profile', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

        await expect(
          service.removeActiveDoll(mockUser.id, 'other-user-id'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
