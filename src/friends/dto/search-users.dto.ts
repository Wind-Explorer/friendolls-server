import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SearchUsersDto {
  @ApiProperty({
    description: 'Username to search for (partial match)',
    example: 'john',
    required: false,
  })
  @IsOptional()
  @IsString()
  username?: string;
}
