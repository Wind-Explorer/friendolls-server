import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DollsService } from './dolls.service';
import { CreateDollDto } from './dto/create-doll.dto';
import { UpdateDollDto } from './dto/update-doll.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@ApiTags('dolls')
@Controller('dolls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DollsController {
  constructor(private readonly dollsService: DollsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new doll',
    description:
      'Creates a new doll with the specified name and optional configuration. Defaults to black outline and white body if no configuration provided.',
  })
  @ApiResponse({
    status: 201,
    description: 'The doll has been successfully created.',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() createDollDto: CreateDollDto,
  ) {
    return this.dollsService.create(authUser.userId, createDollDto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get my dolls',
    description: 'Retrieves all dolls belonging to the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Return list of dolls owned by the user.',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listMyDolls(@CurrentUser() authUser: AuthenticatedUser) {
    return this.dollsService.listByOwner(authUser.userId, authUser.userId);
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: "Get a user's dolls",
    description:
      'Retrieves dolls belonging to a specific user. Requires being friends with that user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Return list of dolls owned by the specified user.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not friends with user',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listUserDolls(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.dollsService.listByOwner(userId, authUser.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a doll by ID',
    description: 'Retrieves a specific doll by its ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Return the doll.',
  })
  @ApiResponse({ status: 404, description: 'Doll not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findOne(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.dollsService.findOne(id, authUser.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a doll',
    description: "Updates a doll's name or configuration.",
  })
  @ApiResponse({
    status: 200,
    description: 'The doll has been successfully updated.',
  })
  @ApiResponse({ status: 404, description: 'Doll not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async update(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateDollDto: UpdateDollDto,
  ) {
    return this.dollsService.update(id, authUser.userId, updateDollDto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a doll',
    description: 'Soft deletes a doll.',
  })
  @ApiResponse({
    status: 204,
    description: 'The doll has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Doll not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async remove(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.dollsService.remove(id, authUser.userId);
  }
}
