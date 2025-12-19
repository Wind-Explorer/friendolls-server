import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsHexColor,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DollColorSchemeDto {
  @ApiProperty({
    description: 'Outline color in HEX code (e.g. #000000)',
    example: '#000000',
  })
  @IsString()
  @IsHexColor()
  outline: string;

  @ApiProperty({
    description: 'Body fill color in HEX code (e.g. #FFFFFF)',
    example: '#FFFFFF',
  })
  @IsString()
  @IsHexColor()
  body: string;
}

export class DollConfigurationDto {
  @ApiPropertyOptional({
    description: 'Color scheme for the doll',
    type: DollColorSchemeDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DollColorSchemeDto)
  colorScheme?: DollColorSchemeDto;
}

export class CreateDollDto {
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
}
