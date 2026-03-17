import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenRequestDto {
  @ApiProperty({ description: 'Refresh token issued by Friendolls' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
