import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DollsService } from './dolls.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Doll } from '@prisma/client';

describe('DollsService', () => {
  let service: DollsService;
  let prismaService: PrismaService;

  const mockDoll: Doll = {
    id: 'doll-1',
    name: 'Test Doll',
    configuration: {
      colorScheme: {
        outline: '#000000',
        body: '#FFFFFF',
      },
    },
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockPrismaService = {
    doll: {
      create: jest.fn().mockResolvedValue(mockDoll),
      findMany: jest.fn().mockResolvedValue([mockDoll]),
      findFirst: jest.fn().mockResolvedValue(mockDoll),
      update: jest.fn().mockResolvedValue(mockDoll),
    },
    friendship: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DollsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<DollsService>(DollsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a doll with default configuration', async () => {
      const createDto = { name: 'New Doll' };
      const userId = 'user-1';

      await service.create(userId, createDto);

      expect(prismaService.doll.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          configuration: {
            colorScheme: {
              outline: '#000000',
              body: '#FFFFFF',
            },
          },
          userId,
        },
      });
    });
  });

  describe('listByOwner', () => {
    it('should return own dolls without friendship check', async () => {
      const userId = 'user-1';
      await service.listByOwner(userId, userId);

      expect(prismaService.doll.findMany).toHaveBeenCalledWith({
        where: {
          userId: userId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });

    it("should return friend's dolls if friends", async () => {
      const ownerId = 'friend-1';
      const requestingUserId = 'user-1';

      // Mock friendship
      jest
        .spyOn(prismaService.friendship, 'findMany')
        .mockResolvedValueOnce([{ friendId: ownerId } as any]);

      await service.listByOwner(ownerId, requestingUserId);

      expect(prismaService.doll.findMany).toHaveBeenCalledWith({
        where: {
          userId: ownerId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });

    it('should throw ForbiddenException if not friends', async () => {
      const ownerId = 'stranger-1';
      const requestingUserId = 'user-1';

      // Mock empty friendship (default)
      jest
        .spyOn(prismaService.friendship, 'findMany')
        .mockResolvedValueOnce([]);

      await expect(
        service.listByOwner(ownerId, requestingUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return a doll if found and owned by user', async () => {
      const userId = 'user-1';
      const dollId = 'doll-1';

      const result = await service.findOne(dollId, userId);
      expect(result).toEqual(mockDoll);
    });

    it('should throw NotFoundException if doll not found', async () => {
      jest.spyOn(prismaService.doll, 'findFirst').mockResolvedValueOnce(null);

      await expect(service.findOne('doll-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if doll not accessible', async () => {
      jest.spyOn(prismaService.doll, 'findFirst').mockResolvedValueOnce(null);

      await expect(service.findOne('doll-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a doll', async () => {
      const updateDto = { name: 'Updated Doll' };
      await service.update('doll-1', 'user-1', updateDto);

      expect(prismaService.doll.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if not owner', async () => {
      jest
        .spyOn(prismaService.doll, 'findFirst')
        .mockResolvedValueOnce({ ...mockDoll, userId: 'user-2' });

      const updateDto = { name: 'Updated Doll' };
      await expect(
        service.update('doll-1', 'user-1', updateDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should soft delete a doll', async () => {
      await service.remove('doll-1', 'user-1');

      expect(prismaService.doll.update).toHaveBeenCalledWith({
        where: { id: 'doll-1' },
        data: {
          deletedAt: expect.any(Date),
        },
      });
    });

    it('should throw ForbiddenException if not owner', async () => {
      jest
        .spyOn(prismaService.doll, 'findFirst')
        .mockResolvedValueOnce({ ...mockDoll, userId: 'user-2' });

      await expect(service.remove('doll-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
