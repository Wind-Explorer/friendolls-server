import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RedisIoAdapter } from './ws/redis-io.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';
  const isProduction = nodeEnv === 'production';

  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Configure Redis Adapter for horizontal scaling (if enabled)
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Enable global exception filter for consistent error responses
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties that are not in the DTO
      whitelist: true,
      // Throw error if non-whitelisted properties are present
      forbidNonWhitelisted: true,
      // Automatically transform payloads to DTO instances
      transform: true,
      // Provide detailed error messages
      disableErrorMessages: isProduction,
    }),
  );

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Friendolls API')
      .setDescription(
        'API for managing users in Friendolls application.\n\n' +
          'Authentication is handled via Passport.js social sign-in for desktop clients.\n' +
          'Desktop clients exchange one-time SSO codes for Friendolls JWT tokens.\n\n' +
          'Include the JWT token in the Authorization header as: `Bearer <token>`',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter Friendolls JWT access token',
          in: 'header',
        },
        'bearer',
      )
      .addTag('users', 'User profile management endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const httpServer = app.getHttpServer() as {
    once?: (event: 'close', listener: () => void) => void;
  } | null;
  httpServer?.once?.('close', () => {
    void redisIoAdapter.close();
  });

  logger.log(`Application is running on: http://${host}:${port}`);
  if (!isProduction) {
    logger.log(
      `Swagger documentation available at: http://${host}:${port}/api`,
    );
  }
}

void bootstrap();
