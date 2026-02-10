import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * JWT Authentication Guard
 *
 * This guard protects routes by requiring a valid JWT token.
 * It uses the JwtStrategy to validate the token and attach user info to the request.
 *
 * Usage:
 * @UseGuards(JwtAuthGuard)
 * async protectedRoute(@Request() req) {
 *   const user = req.user; // Contains validated user info from JWT
 * }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  /**
   * Determines if the request can proceed.
   * Automatically validates the JWT token using JwtStrategy.
   *
   * @param context - The execution context
   * @returns Boolean indicating if the request is authorized
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Log the authentication attempt
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      this.logger.warn(
        '❌ Authentication attempt without Authorization header',
      );
    } else {
      const tokenPreview = String(authHeader).substring(0, 20);
      this.logger.debug(
        `🔐 Authentication attempt with token: ${tokenPreview}...`,
      );
    }

    return super.canActivate(context);
  }

  /**
   * Handles errors during authentication.
   * This method is called when the JWT validation fails.
   *
   * @param err - The error that occurred
   */

  handleRequest(
    err: any,
    user: AuthenticatedUser,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): any {
    const hasMessage = (value: unknown): value is { message?: unknown } =>
      typeof value === 'object' && value !== null && 'message' in value;

    if (err || !user) {
      const infoMessage = hasMessage(info) ? String(info.message) : '';
      const errMessage = hasMessage(err) ? String(err.message) : '';

      this.logger.error(`❌ JWT Authentication failed`);
      this.logger.error(`  Error: ${errMessage || 'none'}`);
      this.logger.error(`  Info: ${infoMessage || 'none'}`);

      if (info && typeof info === 'object') {
        this.logger.error(`  Info details: ${JSON.stringify(info)}`);
      }

      if (err && typeof err === 'object') {
        this.logger.error(`  Error details: ${JSON.stringify(err)}`);
      }
    } else {
      this.logger.debug(
        `✅ JWT Authentication successful for user: ${user.userId || 'unknown'}`,
      );
    }

    // Let passport handle the error (will throw UnauthorizedException)

    return super.handleRequest(err, user, info, context, status);
  }
}
