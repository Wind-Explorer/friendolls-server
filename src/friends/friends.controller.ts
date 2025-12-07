import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { User, FriendRequest } from '@prisma/client';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import {
  FriendRequestResponseDto,
  FriendshipResponseDto,
  UserBasicDto,
} from './dto/friend-response.dto';
import { SearchUsersDto } from './dto/search-users.dto';

type FriendRequestWithRelations = FriendRequest & {
  sender: User;
  receiver: User;
};
import { UsersService } from '../users/users.service';
import { StateGateway } from '../ws/state/state.gateway';

@ApiTags('friends')
@Controller('friends')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FriendsController {
  private readonly logger = new Logger(FriendsController.name);

  constructor(
    private readonly friendsService: FriendsService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly stateGateway: StateGateway,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search users by username',
    description: 'Search for users by username to send friend requests',
  })
  @ApiQuery({
    name: 'username',
    required: false,
    description: 'Username to search for (partial match)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users matching search criteria',
    type: [UserBasicDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async searchUsers(
    @Query() searchDto: SearchUsersDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<UserBasicDto[]> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.debug(
      `Searching users with username: ${searchDto.username || 'all'}`,
    );

    const users = await this.usersService.searchUsers(
      searchDto.username,
      user.id,
    );

    return users.map((u: User) => ({
      id: u.id,
      name: u.name,
      username: u.username ?? undefined,
      picture: u.picture ?? undefined,
    }));
  }

  @Post('requests')
  @ApiOperation({
    summary: 'Send a friend request',
    description: 'Send a friend request to another user',
  })
  @ApiResponse({
    status: 201,
    description: 'Friend request sent successfully',
    type: FriendRequestResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (self-request, already friends, etc.)',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Friend request already exists',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async sendFriendRequest(
    @Body() sendRequestDto: SendFriendRequestDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FriendRequestResponseDto> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.log(
      `User ${user.id} sending friend request to ${sendRequestDto.receiverId}`,
    );

    const friendRequest = await this.friendsService.sendFriendRequest(
      user.id,
      sendRequestDto.receiverId,
    );

    this.stateGateway.emitFriendRequestReceived(
      sendRequestDto.receiverId,
      friendRequest,
    );

    return this.mapFriendRequestToDto(friendRequest);
  }

  @Get('requests/received')
  @ApiOperation({
    summary: 'Get received friend requests',
    description: 'Get all pending friend requests received by the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of received friend requests',
    type: [FriendRequestResponseDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async getReceivedRequests(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FriendRequestResponseDto[]> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.debug(`Getting received friend requests for user ${user.id}`);

    const requests = await this.friendsService.getPendingReceivedRequests(
      user.id,
    );

    return requests.map((req) => this.mapFriendRequestToDto(req));
  }

  @Get('requests/sent')
  @ApiOperation({
    summary: 'Get sent friend requests',
    description: 'Get all pending friend requests sent by the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sent friend requests',
    type: [FriendRequestResponseDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async getSentRequests(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FriendRequestResponseDto[]> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.debug(`Getting sent friend requests for user ${user.id}`);

    const requests = await this.friendsService.getPendingSentRequests(user.id);

    return requests.map((req) => this.mapFriendRequestToDto(req));
  }

  @Post('requests/:id/accept')
  @ApiOperation({
    summary: 'Accept a friend request',
    description: 'Accept a pending friend request',
  })
  @ApiParam({
    name: 'id',
    description: 'Friend request ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Friend request accepted successfully',
    type: FriendRequestResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (not receiver, already processed, etc.)',
  })
  @ApiResponse({
    status: 404,
    description: 'Friend request not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async acceptFriendRequest(
    @Param('id') requestId: string,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FriendRequestResponseDto> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.log(`User ${user.id} accepting friend request ${requestId}`);

    const friendRequest = await this.friendsService.acceptFriendRequest(
      requestId,
      user.id,
    );

    this.stateGateway.emitFriendRequestAccepted(
      friendRequest.senderId,
      friendRequest,
    );

    return this.mapFriendRequestToDto(friendRequest);
  }

  @Post('requests/:id/deny')
  @ApiOperation({
    summary: 'Deny a friend request',
    description: 'Deny a pending friend request',
  })
  @ApiParam({
    name: 'id',
    description: 'Friend request ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Friend request denied successfully',
    type: FriendRequestResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (not receiver, already processed, etc.)',
  })
  @ApiResponse({
    status: 404,
    description: 'Friend request not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async denyFriendRequest(
    @Param('id') requestId: string,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FriendRequestResponseDto> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.log(`User ${user.id} denying friend request ${requestId}`);

    const friendRequest = await this.friendsService.denyFriendRequest(
      requestId,
      user.id,
    );

    this.stateGateway.emitFriendRequestDenied(
      friendRequest.senderId,
      friendRequest,
    );

    return this.mapFriendRequestToDto(friendRequest);
  }

  @Get()
  @ApiOperation({
    summary: 'Get friends list',
    description: 'Get all friends of the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of friends',
    type: [FriendshipResponseDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async getFriends(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FriendshipResponseDto[]> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.debug(`Getting friends list for user ${user.id}`);

    const friendships = await this.friendsService.getFriends(user.id);

    return friendships.map((friendship) => ({
      id: friendship.id,
      friend: {
        id: friendship.friend.id,
        name: friendship.friend.name,
        username: friendship.friend.username ?? undefined,
        picture: friendship.friend.picture ?? undefined,
      },
      createdAt: friendship.createdAt,
    }));
  }

  @Delete(':friendId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Unfriend a user',
    description: 'Remove a user from your friends list',
  })
  @ApiParam({
    name: 'friendId',
    description: 'Friend user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 204,
    description: 'Successfully unfriended',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (cannot unfriend yourself)',
  })
  @ApiResponse({
    status: 404,
    description: 'Friend not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async unfriend(
    @Param('friendId') friendId: string,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    const user = await this.authService.syncUserFromToken(authUser);

    this.logger.log(`User ${user.id} unfriending user ${friendId}`);

    await this.friendsService.unfriend(user.id, friendId);

    this.stateGateway.emitUnfriended(friendId, user.id);
  }

  private mapFriendRequestToDto(
    friendRequest: FriendRequestWithRelations,
  ): FriendRequestResponseDto {
    return {
      id: friendRequest.id,
      sender: {
        id: friendRequest.sender.id,
        name: friendRequest.sender.name,
        username: friendRequest.sender.username ?? undefined,
        picture: friendRequest.sender.picture ?? undefined,
      },
      receiver: {
        id: friendRequest.receiver.id,
        name: friendRequest.receiver.name,
        username: friendRequest.receiver.username ?? undefined,
        picture: friendRequest.receiver.picture ?? undefined,
      },
      status: friendRequest.status,
      createdAt: friendRequest.createdAt,
      updatedAt: friendRequest.updatedAt,
    };
  }
}
