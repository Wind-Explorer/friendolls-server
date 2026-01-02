import { ApiProperty } from '@nestjs/swagger';
import type { DatabaseHealth } from './app.service';

export class HealthResponseDto {
  @ApiProperty({
    enum: ['OK', 'DOWN'],
    example: 'OK',
    description: 'Overall service status',
  })
  status!: DatabaseHealth;

  @ApiProperty({ description: 'Server build version', example: '0.0.1' })
  version!: string;

  @ApiProperty({ description: 'Process uptime in seconds', example: 123 })
  uptimeSecs!: number;

  @ApiProperty({ enum: ['OK', 'DOWN'], example: 'OK' })
  db!: DatabaseHealth;
}
