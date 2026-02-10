import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './users.entity';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

describe('UsersController', () => {
  let controller: UsersController;

  const mockFindOne = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();

  const mockUsersService = {
    findOne: mockFindOne,
    update: mockUpdate,
    delete: mockDelete,
  };

  const mockAuthUser: AuthenticatedUser = {
    userId: 'uuid-123',
    email: 'test@example.com',
    roles: ['user'],
  };

  const mockUser = {
    id: 'uuid-123',
    keycloakSub: 'legacy-sub',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    picture: null,
    roles: ['user'],
    passwordHash: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastLoginAt: new Date('2024-01-01'),
    activeDollId: null,
  } as unknown as User & { passwordHash: string | null };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
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
    it('should return the current user', async () => {
      mockFindOne.mockResolvedValue(mockUser);

      const result = await controller.getCurrentUser(mockAuthUser);

      expect(result).toBe(mockUser);
      expect(mockFindOne).toHaveBeenCalledWith(mockAuthUser.userId);
    });
  });

  describe('updateCurrentUser', () => {
    it('should update the current user profile', async () => {
      const updateDto: UpdateUserDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };

      mockUpdate.mockResolvedValue(updatedUser);

      const result = await controller.updateCurrentUser(
        mockAuthUser,
        updateDto,
      );

      expect(result).toBe(updatedUser);
      expect(mockUpdate).toHaveBeenCalledWith(
        mockAuthUser.userId,
        updateDto,
        mockAuthUser.userId,
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
    it('should update a user profile', async () => {
      const updateDto: UpdateUserDto = { name: 'New Name' };
      const updatedUser = { ...mockUser, name: 'New Name' };

      mockUpdate.mockResolvedValue(updatedUser);

      const result = await controller.update(
        mockUser.id,
        updateDto,
        mockAuthUser,
      );

      expect(result).toBe(updatedUser);
      expect(mockUpdate).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
        mockAuthUser.userId,
      );
    });

    it('should throw ForbiddenException if updating another user', async () => {
      mockUpdate.mockRejectedValue(
        new ForbiddenException('You can only update your own profile'),
      );

      await expect(
        controller.update(mockUser.id, { name: 'Hacker' }, mockAuthUser),
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
    it('should delete the current user account', async () => {
      mockDelete.mockResolvedValue(undefined);

      await controller.deleteCurrentUser(mockAuthUser);

      expect(mockDelete).toHaveBeenCalledWith(
        mockAuthUser.userId,
        mockAuthUser.userId,
      );
    });
  });

  describe('delete', () => {
    it('should delete a user by ID', async () => {
      mockDelete.mockResolvedValue(undefined);

      await controller.delete(mockUser.id, mockAuthUser);

      expect(mockDelete).toHaveBeenCalledWith(mockUser.id, mockAuthUser.userId);
    });

    it('should throw ForbiddenException if deleting another user', async () => {
      mockDelete.mockRejectedValue(
        new ForbiddenException('You can only delete your own account'),
      );

      await expect(
        controller.delete(mockUser.id, mockAuthUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockDelete.mockRejectedValue(new NotFoundException('User not found'));

      await expect(
        controller.delete('non-existent-id', mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
