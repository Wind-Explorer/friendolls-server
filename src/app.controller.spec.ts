import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([1]),
  } as unknown as PrismaService;

  const prismaDownMock = {
    $queryRaw: jest.fn().mockRejectedValue(new Error('db down')),
  } as unknown as PrismaService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return health payload', async () => {
      const res = { status: jest.fn() } as unknown as Response;
      const response = await appController.getHealth(res);

      expect(res.status).not.toHaveBeenCalled();
      expect(['OK', 'DOWN']).toContain(response.status);
      expect(response.version).toBeDefined();
      expect(response.uptimeSecs).toBeGreaterThanOrEqual(0);
      expect(['OK', 'DOWN']).toContain(response.db);
    });

    it('should mark down and set 503 when db fails', async () => {
      const app: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          AppService,
          { provide: PrismaService, useValue: prismaDownMock },
        ],
      }).compile();

      const controller = app.get<AppController>(AppController);
      const res = { status: jest.fn() } as unknown as Response;

      const response = await controller.getHealth(res);

      expect(res.status).toHaveBeenCalledWith(503 as const);
      expect(response.status).toBe('DOWN');
      expect(response.db).toBe('DOWN');
    });
  });
});
