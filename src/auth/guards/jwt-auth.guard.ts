import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * JWT Authentication Guard
 *
 * This guard protects routes by requiring a valid JWT token from Keycloak.
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      this.logger.warn('Authentication attempt without Authorization header');
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
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): any {
    if (err || !user) {
      const infoMessage =
        info && typeof info === 'object' && 'message' in info
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            String(info.message)
          : '';
      const errMessage =
        err && typeof err === 'object' && 'message' in err
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            String(err.message)
          : '';
      this.logger.warn(
        `Authentication failed: ${infoMessage || errMessage || 'Unknown error'}`,
      );
    }

    // Let passport handle the error (will throw UnauthorizedException)

    return super.handleRequest(err, user, info, context, status);
  }
}
