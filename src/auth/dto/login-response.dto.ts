import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Access token expiration in seconds' })
  expiresIn: number;

  @ApiProperty({ description: 'Opaque refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'Refresh token expiration in seconds' })
  refreshExpiresIn: number;
}
