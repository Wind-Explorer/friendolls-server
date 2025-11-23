import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { User } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: PrismaService;

  const mockUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    keycloakSub: 'f:realm:user123',
    email: 'john@example.com',
    name: 'John Doe',
    username: 'johndoe',
    picture: 'https://example.com/avatar.jpg',
    roles: ['user', 'premium'],
    createdAt: new Date('2024-01-15T10:30:00.000Z'),
    updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    lastLoginAt: new Date('2024-01-15T10:30:00.000Z'),
  };

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
    prismaService = module.get<PrismaService>(PrismaService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFromToken', () => {
    it('should create a new user from Keycloak token data', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'john@example.com',
        name: 'John Doe',
        username: 'johndoe',
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium'],
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.keycloakSub).toBe('f:realm:user123');
      expect(user.email).toBe('john@example.com');
      expect(user.name).toBe('John Doe');
      expect(user.username).toBe('johndoe');
      expect(user.picture).toBe('https://example.com/avatar.jpg');
      expect(user.roles).toEqual(['user', 'premium']);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          keycloakSub: tokenData.keycloakSub,
          email: tokenData.email,
          name: tokenData.name,
          username: tokenData.username,
          picture: tokenData.picture,
          roles: tokenData.roles,
        }),
      });
    });

    it('should return existing user if keycloakSub already exists', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'john@example.com',
        name: 'John Doe',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { keycloakSub: tokenData.keycloakSub },
      });
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should handle optional fields', async () => {
      const tokenData = {
        keycloakSub: 'f:realm:user456',
        email: 'jane@example.com',
        name: 'Jane Doe',
      };

      const newUser = { ...mockUser, username: null, picture: null, roles: [] };
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(newUser);

      const user = await service.createFromToken(tokenData);

      expect(user).toBeDefined();
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          keycloakSub: tokenData.keycloakSub,
          email: tokenData.email,
          name: tokenData.name,
          username: undefined,
          picture: undefined,
          roles: [],
        }),
      });
    });
  });

  describe('findByKeycloakSub', () => {
    it('should return a user by keycloakSub', async () => {
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
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { keycloakSub: 'nonexistent' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.findOne(mockUser.id);

      expect(user).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      const nonexistentId = 'nonexistent-id';
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(nonexistentId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(nonexistentId)).rejects.toThrow(
        `User with ID ${nonexistentId} not found`,
      );
    });
  });

  describe('updateFromToken', () => {
    it('should update user from token data', async () => {
      const updateData = {
        email: 'updated@example.com',
        name: 'Updated Name',
        lastLoginAt: new Date('2024-01-20T14:45:00.000Z'),
      };

      const updatedUser = { ...mockUser, ...updateData };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.updateFromToken('f:realm:user123', updateData);

      expect(user).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
        data: expect.objectContaining({
          email: updateData.email,
          name: updateData.name,
          lastLoginAt: updateData.lastLoginAt,
        }),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateFromToken('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should only update provided fields', async () => {
      const updateData = {
        name: 'New Name',
      };

      const updatedUser = { ...mockUser, ...updateData };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      await service.updateFromToken('f:realm:user123', updateData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { keycloakSub: 'f:realm:user123' },
        data: { name: 'New Name' },
      });
    });
  });

  describe('update', () => {
    it('should update user profile', async () => {
      const updateDto: UpdateUserDto = {
        name: 'Updated Name',
      };

      const updatedUser = { ...mockUser, name: updateDto.name };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const user = await service.update(
        mockUser.id,
        updateDto,
        mockUser.keycloakSub,
      );

      expect(user.name).toBe(updateDto.name);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { name: updateDto.name },
      });
    });

    it('should throw ForbiddenException if user tries to update someone else', async () => {
      const updateDto: UpdateUserDto = {
        name: 'Hacker Name',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.update(mockUser.id, updateDto, 'different-keycloak-sub'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const updateDto: UpdateUserDto = {
        name: 'Test',
      };

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
});
