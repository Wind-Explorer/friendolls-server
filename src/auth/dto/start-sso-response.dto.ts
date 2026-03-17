import { ApiProperty } from '@nestjs/swagger';

export class StartSsoResponseDto {
  @ApiProperty({
    description: 'Opaque state value echoed back to the desktop callback',
  })
  state!: string;
}
