import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { User } from './users.entity';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

describe('UsersController', () => {
  let controller: UsersController;

  const mockFindOne = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockFindByKeycloakSub = jest.fn();

  const mockSyncUserFromToken = jest.fn();

  const mockUsersService = {
    findOne: mockFindOne,
    update: mockUpdate,
    delete: mockDelete,
    findByKeycloakSub: mockFindByKeycloakSub,
  };

  const mockAuthService = {
    syncUserFromToken: mockSyncUserFromToken,
  };

  const mockAuthUser: AuthenticatedUser = {
    keycloakSub: 'f:realm:user123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    roles: ['user'],
  };

  const mockUser: User = {
    id: 'uuid-123',
    keycloakSub: 'f:realm:user123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    roles: ['user'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastLoginAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCurrentUser', () => {
    it('should return current user profile and sync from token', async () => {
      mockSyncUserFromToken.mockResolvedValue(mockUser);

      const result = await controller.getCurrentUser(mockAuthUser);

      expect(result).toEqual(mockUser);
      expect(mockSyncUserFromToken).toHaveBeenCalledWith(mockAuthUser);
    });
  });

  describe('updateCurrentUser', () => {
    it('should update current user profile', async () => {
      const updateDto: UpdateUserDto = { name: 'Updated Name' };
      const updatedUser: User = { ...mockUser, name: 'Updated Name' };

      mockSyncUserFromToken.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue(updatedUser);

      const result = await controller.updateCurrentUser(
        mockAuthUser,
        updateDto,
      );

      expect(result).toEqual(updatedUser);
      expect(mockSyncUserFromToken).toHaveBeenCalledWith(mockAuthUser);
      expect(mockUpdate).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
        mockAuthUser.keycloakSub,
      );
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockFindOne.mockReturnValue(mockUser);

      const result = await controller.findOne('uuid-123', mockAuthUser);

      expect(result).toEqual(mockUser);
      expect(mockFindOne).toHaveBeenCalledWith('uuid-123');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockFindOne.mockImplementation(() => {
        throw new NotFoundException('User with ID non-existent not found');
      });

      await expect(
        controller.findOne('non-existent', mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if id is empty', async () => {
      mockFindOne.mockImplementation(() => {
        throw new NotFoundException('User with ID  not found');
      });

      await expect(controller.findOne('', mockAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a user by id', async () => {
      const updateDto: UpdateUserDto = { name: 'Updated Name' };
      const updatedUser: User = { ...mockUser, name: 'Updated Name' };

      mockUpdate.mockReturnValue(updatedUser);

      const result = await controller.update(
        'uuid-123',
        updateDto,
        mockAuthUser,
      );

      expect(result).toEqual(updatedUser);
      expect(mockUpdate).toHaveBeenCalledWith(
        'uuid-123',
        updateDto,
        mockAuthUser.keycloakSub,
      );
    });

    it('should throw ForbiddenException when trying to update another user', async () => {
      const updateDto: UpdateUserDto = { name: 'Updated Name' };

      mockUpdate.mockImplementation(() => {
        throw new ForbiddenException('You can only update your own profile');
      });

      await expect(
        controller.update('different-uuid', updateDto, mockAuthUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if user not found', async () => {
      const updateDto: UpdateUserDto = { name: 'Updated' };

      mockUpdate.mockImplementation(() => {
        throw new NotFoundException('User with ID non-existent not found');
      });

      await expect(
        controller.update('non-existent', updateDto, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCurrentUser', () => {
    it('should delete current user account', async () => {
      mockSyncUserFromToken.mockResolvedValue(mockUser);
      mockDelete.mockReturnValue(undefined);

      await controller.deleteCurrentUser(mockAuthUser);

      expect(mockSyncUserFromToken).toHaveBeenCalledWith(mockAuthUser);
      expect(mockDelete).toHaveBeenCalledWith(
        mockUser.id,
        mockAuthUser.keycloakSub,
      );
    });
  });

  describe('delete', () => {
    it('should delete a user by id', () => {
      mockDelete.mockReturnValue(undefined);

      controller.delete('uuid-123', mockAuthUser);

      expect(mockDelete).toHaveBeenCalledWith(
        'uuid-123',
        mockAuthUser.keycloakSub,
      );
    });

    it('should throw ForbiddenException when trying to delete another user', () => {
      mockDelete.mockImplementation(() => {
        throw new ForbiddenException('You can only delete your own account');
      });

      expect(() => controller.delete('different-uuid', mockAuthUser)).toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if user not found', () => {
      mockDelete.mockImplementation(() => {
        throw new NotFoundException('User with ID non-existent not found');
      });

      expect(() => controller.delete('non-existent', mockAuthUser)).toThrow(
        NotFoundException,
      );
    });
  });
});
