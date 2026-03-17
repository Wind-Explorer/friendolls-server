import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginResponseDto } from './dto/login-response.dto';
import { StartSsoRequestDto } from './dto/start-sso-request.dto';
import { StartSsoResponseDto } from './dto/start-sso-response.dto';
import { ExchangeSsoCodeRequestDto } from './dto/exchange-sso-code-request.dto';
import { RefreshTokenRequestDto } from './dto/refresh-token-request.dto';
import { LogoutRequestDto } from './dto/logout-request.dto';
import type { SocialAuthProfile } from './types/social-auth-profile';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { DiscordAuthGuard } from './guards/discord-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('sso/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create an SSO state token for the desktop app' })
  @ApiResponse({ status: 200, type: StartSsoResponseDto })
  startSso(@Body() body: StartSsoRequestDto): StartSsoResponseDto {
    return this.authService.startSso(body.provider, body.redirectUri);
  }

  @Get('sso/google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Begin Google sign-in' })
  async startGoogle(): Promise<void> {}

  @Get('sso/google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Handle Google sign-in callback' })
  async finishGoogle(
    @Req() request: Request,
    @Res() response: Response,
    @Query('state') state?: string,
  ): Promise<void> {
    await this.finishSso('google', request, response, state);
  }

  @Get('sso/discord')
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Begin Discord sign-in' })
  async startDiscord(): Promise<void> {}

  @Get('sso/discord/callback')
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Handle Discord sign-in callback' })
  async finishDiscord(
    @Req() request: Request,
    @Res() response: Response,
    @Query('state') state?: string,
  ): Promise<void> {
    await this.finishSso('discord', request, response, state);
  }

  @Post('sso/exchange')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange a one-time desktop auth code for app tokens',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired exchange code' })
  async exchangeSsoCode(
    @Body() body: ExchangeSsoCodeRequestDto,
  ): Promise<LoginResponseDto> {
    return this.authService.exchangeSsoCode(body.code);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate app tokens using a refresh token' })
  @ApiBody({ type: RefreshTokenRequestDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async refresh(
    @Body() body: RefreshTokenRequestDto,
  ): Promise<LoginResponseDto> {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a refresh token session' })
  @ApiBody({ type: LogoutRequestDto })
  async logout(@Body() body: LogoutRequestDto): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  private async finishSso(
    provider: 'google' | 'discord',
    request: Request,
    response: Response,
    state?: string,
  ): Promise<void> {
    if (!state) {
      throw new BadRequestException('Missing SSO state');
    }

    const profile = request.user as SocialAuthProfile | undefined;
    if (!profile) {
      throw new BadRequestException('Missing SSO profile');
    }

    const redirectUri = await this.authService.completeSso(
      provider,
      state,
      profile,
    );
    this.logger.log(`Completed ${provider} SSO callback`);
    response.redirect(302, redirectUri);
  }
}
