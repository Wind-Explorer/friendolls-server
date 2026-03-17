import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { DiscordStrategy } from './strategies/discord.strategy';
import { JwtVerificationService } from './services/jwt-verification.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { DiscordAuthGuard } from './guards/discord-auth.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    forwardRef(() => UsersModule),
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    GoogleStrategy,
    DiscordStrategy,
    GoogleAuthGuard,
    DiscordAuthGuard,
    AuthService,
    JwtVerificationService,
  ],
  exports: [AuthService, PassportModule, JwtVerificationService],
})
export class AuthModule {}
