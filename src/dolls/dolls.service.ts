import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDollDto, DollConfigurationDto } from './dto/create-doll.dto';
import { UpdateDollDto } from './dto/update-doll.dto';
import { Doll, Prisma } from '@prisma/client';

@Injectable()
export class DollsService {
  private readonly logger = new Logger(DollsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createDollDto: CreateDollDto): Promise<Doll> {
    const defaultConfiguration: DollConfigurationDto = {
      colorScheme: {
        outline: '#000000',
        body: '#FFFFFF',
      },
    };

    // Merge default configuration with provided configuration
    // If configuration or colorScheme is not provided, use defaults
    const configuration: DollConfigurationDto = {
      ...defaultConfiguration,
      ...(createDollDto.configuration || {}),
      colorScheme: {
        ...defaultConfiguration.colorScheme!,
        ...(createDollDto.configuration?.colorScheme || {}),
      },
    };

    return this.prisma.doll.create({
      data: {
        name: createDollDto.name,
        configuration: configuration as unknown as Prisma.InputJsonValue,
        userId,
      },
    });
  }

  async findAll(userId: string): Promise<Doll[]> {
    return this.prisma.doll.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string, userId: string): Promise<Doll> {
    const doll = await this.prisma.doll.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!doll) {
      throw new NotFoundException(`Doll with ID ${id} not found`);
    }

    if (doll.userId !== userId) {
      throw new ForbiddenException('You do not have access to this doll');
    }

    return doll;
  }

  async update(
    id: string,
    userId: string,
    updateDollDto: UpdateDollDto,
  ): Promise<Doll> {
    const doll = await this.findOne(id, userId);

    let configuration = doll.configuration as unknown as DollConfigurationDto;

    if (updateDollDto.configuration) {
      // Deep merge configuration if provided
      configuration = {
        ...configuration,
        ...updateDollDto.configuration,
        colorScheme: {
          outline:
            updateDollDto.configuration.colorScheme?.outline ||
            configuration.colorScheme?.outline ||
            '#000000',
          body:
            updateDollDto.configuration.colorScheme?.body ||
            configuration.colorScheme?.body ||
            '#FFFFFF',
        },
      };
    }

    return this.prisma.doll.update({
      where: { id },
      data: {
        name: updateDollDto.name,
        configuration: configuration as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    // Check existence and ownership
    await this.findOne(id, userId);

    // Soft delete
    await this.prisma.doll.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
