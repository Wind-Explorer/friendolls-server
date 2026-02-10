import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Interface representing the authenticated user from JWT token.
 * This matches the object returned by JwtStrategy.validate()
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
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
 * async getProfile(@CurrentUser('userId') userId: string) {
 *   return { userId };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // If a specific property is requested, return only that property
    return data ? user?.[data] : user;
  },
);
