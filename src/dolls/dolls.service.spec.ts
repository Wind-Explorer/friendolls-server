import { Test, TestingModule } from '@nestjs/testing';
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DollsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
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

  describe('findAll', () => {
    it('should return an array of dolls', async () => {
      const userId = 'user-1';
      await service.findAll(userId);

      expect(prismaService.doll.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
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

    it('should throw ForbiddenException if doll belongs to another user', async () => {
      jest
        .spyOn(prismaService.doll, 'findFirst')
        .mockResolvedValueOnce({ ...mockDoll, userId: 'user-2' });

      await expect(service.findOne('doll-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update a doll', async () => {
      const updateDto = { name: 'Updated Doll' };
      await service.update('doll-1', 'user-1', updateDto);

      expect(prismaService.doll.update).toHaveBeenCalled();
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
  });
});
