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
import { AuthService } from '../auth/auth.service';

@ApiTags('dolls')
@Controller('dolls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DollsController {
  constructor(
    private readonly dollsService: DollsService,
    private readonly authService: AuthService,
  ) {}

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
    const user = await this.authService.ensureUserExists(authUser);
    return this.dollsService.create(user.id, createDollDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all dolls',
    description: 'Retrieves all dolls belonging to the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Return all dolls.',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() authUser: AuthenticatedUser) {
    const user = await this.authService.ensureUserExists(authUser);
    return this.dollsService.findAll(user.id);
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
    const user = await this.authService.ensureUserExists(authUser);
    return this.dollsService.findOne(id, user.id);
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
    const user = await this.authService.ensureUserExists(authUser);
    return this.dollsService.update(id, user.id, updateDollDto);
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
    const user = await this.authService.ensureUserExists(authUser);
    return this.dollsService.remove(id, user.id);
  }
}
