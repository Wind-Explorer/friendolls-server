import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { SSO_PROVIDERS, type SsoProvider } from './sso-provider';

export class StartSsoRequestDto {
  @ApiProperty({ enum: SSO_PROVIDERS, example: 'google' })
  @IsIn(SSO_PROVIDERS)
  provider!: SsoProvider;

  @ApiProperty({ example: 'http://127.0.0.1:43123/callback' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true, require_host: true, require_tld: false })
  redirectUri!: string;
}
