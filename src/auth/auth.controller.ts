import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered' })
  @ApiBadRequestResponse({ description: 'Invalid registration data' })
  async register(@Body() body: RegisterRequestDto) {
    const user = await this.authService.register(body);
    this.logger.log(`Registered user: ${user.id}`);
    return { id: user.id };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(@Body() body: LoginRequestDto): Promise<LoginResponseDto> {
    return this.authService.login(body.email, body.password);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 204, description: 'Password updated' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('reset-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Reset password with old password' })
  @ApiResponse({ status: 204, description: 'Password updated' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      user.userId,
      body.oldPassword,
      body.newPassword,
    );
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LoginResponseDto> {
    return this.authService.refreshToken(user);
  }
}
