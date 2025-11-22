import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import type { UpdateUserDto } from './dto/update-user.dto';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFromToken', () => {
    it('should create a new user from Keycloak token data', () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'john@example.com',
        name: 'John Doe',
        username: 'johndoe',
        picture: 'https://example.com/avatar.jpg',
        roles: ['user', 'premium'],
      };

      const user = service.createFromToken(tokenData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe('string');
      expect(user.keycloakSub).toBe('f:realm:user123');
      expect(user.email).toBe('john@example.com');
      expect(user.name).toBe('John Doe');
      expect(user.username).toBe('johndoe');
      expect(user.picture).toBe('https://example.com/avatar.jpg');
      expect(user.roles).toEqual(['user', 'premium']);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.lastLoginAt).toBeInstanceOf(Date);
    });

    it('should return existing user if keycloakSub already exists', () => {
      const tokenData = {
        keycloakSub: 'f:realm:user123',
        email: 'john@example.com',
        name: 'John Doe',
      };

      const user1 = service.createFromToken(tokenData);
      const user2 = service.createFromToken(tokenData);

      expect(user1.id).toBe(user2.id);
      expect(user1.keycloakSub).toBe(user2.keycloakSub);
    });
  });

  describe('findByKeycloakSub', () => {
    it('should return the user if found by keycloakSub', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const user = service.findByKeycloakSub('f:realm:user123');

      expect(user).toBeDefined();
      expect(user?.id).toBe(createdUser.id);
      expect(user?.keycloakSub).toBe('f:realm:user123');
    });

    it('should return null if user not found by keycloakSub', () => {
      const user = service.findByKeycloakSub('non-existent-sub');
      expect(user).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return the user if found by ID', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const user = service.findOne(createdUser.id);

      expect(user).toEqual(createdUser);
    });

    it('should throw NotFoundException if user not found by ID', () => {
      expect(() => service.findOne('non-existent-id')).toThrow(
        NotFoundException,
      );
      expect(() => service.findOne('non-existent-id')).toThrow(
        'User with ID non-existent-id not found',
      );
    });
  });

  describe('updateFromToken', () => {
    it('should update user data from token and set lastLoginAt', async () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'old@example.com',
        name: 'Old Name',
      });

      const originalUpdatedAt = createdUser.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedUser = service.updateFromToken('f:realm:user123', {
        email: 'new@example.com',
        name: 'New Name',
        username: 'newusername',
        roles: ['admin'],
        lastLoginAt: new Date(),
      });

      expect(updatedUser.id).toBe(createdUser.id);
      expect(updatedUser.email).toBe('new@example.com');
      expect(updatedUser.name).toBe('New Name');
      expect(updatedUser.username).toBe('newusername');
      expect(updatedUser.roles).toEqual(['admin']);
      expect(updatedUser.lastLoginAt).toBeDefined();
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });

    it('should throw NotFoundException if user not found', () => {
      expect(() =>
        service.updateFromToken('non-existent-sub', {
          email: 'test@example.com',
        }),
      ).toThrow(NotFoundException);
    });

    it('should only update provided fields', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'original@example.com',
        name: 'Original Name',
        username: 'original',
      });

      const updatedUser = service.updateFromToken('f:realm:user123', {
        email: 'updated@example.com',
        // name and username not provided
      });

      expect(updatedUser.email).toBe('updated@example.com');
      expect(updatedUser.name).toBe('Original Name'); // unchanged
      expect(updatedUser.username).toBe('original'); // unchanged
    });
  });

  describe('update', () => {
    it('should update user profile when user updates their own profile', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Old Name',
      });

      const updateUserDto: UpdateUserDto = {
        name: 'New Name',
      };

      const updatedUser = service.update(
        createdUser.id,
        updateUserDto,
        'f:realm:user123',
      );

      expect(updatedUser.id).toBe(createdUser.id);
      expect(updatedUser.name).toBe('New Name');
    });

    it('should throw ForbiddenException when user tries to update another user', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const updateUserDto: UpdateUserDto = { name: 'New Name' };

      expect(() =>
        service.update(createdUser.id, updateUserDto, 'f:realm:differentuser'),
      ).toThrow(ForbiddenException);

      expect(() =>
        service.update(createdUser.id, updateUserDto, 'f:realm:differentuser'),
      ).toThrow('You can only update your own profile');
    });

    it('should throw NotFoundException if user not found', () => {
      const updateUserDto: UpdateUserDto = { name: 'New Name' };

      expect(() =>
        service.update('non-existent-id', updateUserDto, 'f:realm:user123'),
      ).toThrow(NotFoundException);
    });

    it('should update user profile with empty name', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Old Name',
      });

      const updateUserDto: UpdateUserDto = { name: '' };

      const updatedUser = service.update(
        createdUser.id,
        updateUserDto,
        'f:realm:user123',
      );

      expect(updatedUser.name).toBe('');
    });

    it('should update user profile with very long name', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Old Name',
      });

      const longName = 'A'.repeat(200); // Exceeds typical limits
      const updateUserDto: UpdateUserDto = { name: longName };

      const updatedUser = service.update(
        createdUser.id,
        updateUserDto,
        'f:realm:user123',
      );

      expect(updatedUser.name).toBe(longName);
    });
  });

  describe('delete', () => {
    it('should delete user when user deletes their own account', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'delete@example.com',
        name: 'To Delete',
      });

      service.delete(createdUser.id, 'f:realm:user123');

      expect(() => service.findOne(createdUser.id)).toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user tries to delete another user', () => {
      const createdUser = service.createFromToken({
        keycloakSub: 'f:realm:user123',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(() =>
        service.delete(createdUser.id, 'f:realm:differentuser'),
      ).toThrow(ForbiddenException);

      expect(() =>
        service.delete(createdUser.id, 'f:realm:differentuser'),
      ).toThrow('You can only delete your own account');
    });

    it('should throw NotFoundException if user not found', () => {
      expect(() =>
        service.delete('non-existent-id', 'f:realm:user123'),
      ).toThrow(NotFoundException);
    });
  });
});
