import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { User, UserResponseDto } from './users.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

/**
 * Users Controller
 *
 * Handles user-related HTTP endpoints.
 * All endpoints require authentication via JWT.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Get current authenticated user's profile.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the authenticated user profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async getCurrentUser(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<User> {
    this.logger.debug(`Get current user: ${authUser.userId}`);

    return this.usersService.findOne(authUser.userId);
  }

  /**
   * Update current authenticated user's profile.
   */
  @Put('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates the authenticated user profile. Users can only update their own profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async updateCurrentUser(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    this.logger.log(`Update current user: ${authUser.userId}`);

    return this.usersService.update(
      authUser.userId,
      updateUserDto,
      authUser.userId,
    );
  }

  /**
   * Get a user by their ID.
   * Currently allows any authenticated user to view other users.
   * Consider adding additional authorization if needed.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a user by ID',
    description: 'Retrieves a user profile by their internal ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'User internal UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<User> {
    this.logger.debug(
      `Get user by ID: ${id} (requested by ${authUser.userId})`,
    );
    return this.usersService.findOne(id);
  }

  /**
   * Update a user by their ID.
   * Users can only update their own profile (enforced by service layer).
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update a user by ID',
    description:
      'Updates a user profile. Users can only update their own profile.',
  })
  @ApiParam({
    name: 'id',
    description: 'User internal UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiForbiddenResponse({
    description: 'Cannot update another user profile',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<User> {
    this.logger.log(`Update user ${id} (requested by ${authUser.userId})`);
    return this.usersService.update(id, updateUserDto, authUser.userId);
  }

  /**
   * Delete current authenticated user's account.
   * Note: This only deletes the local user record.
   * The user data is deleted locally.
   */
  @Delete('me')
  @ApiOperation({
    summary: 'Delete current user account',
    description:
      'Deletes the authenticated user account. Only removes local data.',
  })
  @ApiResponse({
    status: 204,
    description: 'User account deleted successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  @HttpCode(204)
  async deleteCurrentUser(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    this.logger.log(`Delete current user: ${authUser.userId}`);

    await this.usersService.delete(authUser.userId, authUser.userId);
  }

  /**
   * Delete a user by their ID.
   * Users can only delete their own account (enforced by service layer).
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user by ID',
    description:
      'Deletes a user account. Users can only delete their own account.',
  })
  @ApiParam({
    name: 'id',
    description: 'User internal UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 204,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiForbiddenResponse({
    description: 'Cannot delete another user account',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    this.logger.log(`Delete user ${id} (requested by ${authUser.userId})`);
    await this.usersService.delete(id, authUser.userId);
  }

  /**
   * Set the active doll for the current user.
   */
  @Put('me/active-doll/:dollId')
  @ApiOperation({
    summary: 'Set active doll',
    description:
      'Sets the active doll for the authenticated user. The doll must belong to the user.',
  })
  @ApiParam({
    name: 'dollId',
    description: 'Doll internal UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Active doll set successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Doll not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Doll does not belong to the user',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async setActiveDoll(
    @Param('dollId') dollId: string,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<User> {
    this.logger.log(
      `Set active doll ${dollId} (requested by ${authUser.userId})`,
    );
    return this.usersService.setActiveDoll(
      authUser.userId,
      dollId,
      authUser.userId,
    );
  }

  /**
   * Remove the active doll for the current user.
   */
  @Delete('me/active-doll')
  @ApiOperation({
    summary: 'Remove active doll',
    description: 'Removes the active doll for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active doll removed successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async removeActiveDoll(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<User> {
    this.logger.log(`Remove active doll (requested by ${authUser.userId})`);

    return this.usersService.removeActiveDoll(authUser.userId, authUser.userId);
  }
}
