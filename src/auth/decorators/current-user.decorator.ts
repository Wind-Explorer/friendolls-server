import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Interface representing the authenticated user from JWT token.
 * This matches the object returned by JwtStrategy.validate()
 */
export interface AuthenticatedUser {
  keycloakSub: string;
  email?: string;
  name?: string;
  username?: string;
  picture?: string;
  roles?: string[];
}

/**
 * CurrentUser Decorator
 *
 * Extracts the authenticated user from the request object.
 * Must be used in conjunction with JwtAuthGuard.
 *
 * @example
 * ```typescript
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
 *   return user;
 * }
 * ```
 *
 * @example
 * Extract specific property:
 * ```typescript
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * async getProfile(@CurrentUser('keycloakSub') sub: string) {
 *   return { sub };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = ctx.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const user = request.user as AuthenticatedUser;

    // If a specific property is requested, return only that property
    return data ? user?.[data] : user;
  },
);
