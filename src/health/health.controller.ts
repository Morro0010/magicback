import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @PublicRoute()
  getHealth() {
    return this.healthService.getStatus();
  }
}
