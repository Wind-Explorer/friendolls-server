import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { AppModule } from './../src/app.module';

const prismaMock = {
  $queryRaw: jest.fn().mockResolvedValue([1]),
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) returns ok with db up', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect('Cache-Control', 'no-store')
      .expect(200)
      .expect(
        ({
          body,
        }: {
          body: {
            status: string;
            version: string;
            uptimeSecs: number;
            db: string;
          };
        }) => {
          expect(body.status).toBe('ok');
          expect(body.db).toBe('ok');
          expect(body.version).toBeDefined();
          expect(body.uptimeSecs).toBeGreaterThanOrEqual(0);
        },
      );
  });

  it('/health (GET) returns 503 with db down', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .get('/health')
      .expect('Cache-Control', 'no-store')
      .expect(503)
      .expect(
        ({
          body,
        }: {
          body: {
            status: string;
            db: string;
          };
        }) => {
          expect(body.status).toBe('DOWN');
          expect(body.db).toBe('DOWN');
        },
      );
  });
});
