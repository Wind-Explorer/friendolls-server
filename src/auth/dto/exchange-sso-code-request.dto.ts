import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeSsoCodeRequestDto {
  @ApiProperty({
    description: 'One-time auth code returned to the desktop callback',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
