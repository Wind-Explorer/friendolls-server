import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DollConfigurationDto } from './create-doll.dto';

export class ActiveDollDto {
  @ApiProperty({
    description: 'Unique identifier of the doll',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Display name of the doll',
    example: 'My First Doll',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Configuration for the doll',
    type: DollConfigurationDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DollConfigurationDto)
  configuration?: DollConfigurationDto;

  @ApiProperty({
    description: 'Creation date of the doll',
    example: '2023-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update date of the doll',
    example: '2023-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}
