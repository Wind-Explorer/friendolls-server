import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, HealthResponse } from './app.service';
import { HealthResponseDto } from './app.health-response.dto';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Service health', type: HealthResponseDto })
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const health = await this.appService.getHealth();

    if (health.status === 'DOWN') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
