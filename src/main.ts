import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

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
      disableErrorMessages: false,
    }),
  );

  // Configure Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Friendolls API')
    .setDescription(
      'API for managing users in Friendolls application.\n\n' +
        'Authentication is handled via Keycloak OpenID Connect.\n' +
        'Users must authenticate via Keycloak to obtain a JWT token.\n\n' +
        'Include the JWT token in the Authorization header as: `Bearer <token>`',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token obtained from Keycloak',
        in: 'header',
      },
      'bearer',
    )
    .addTag('users', 'User profile management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application is running on: http://${host}:${port}`);
  logger.log(`Swagger documentation available at: http://${host}:${port}/api`);
}

void bootstrap();
