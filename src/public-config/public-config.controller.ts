import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import { PublicConfigService } from './public-config.service';

@Controller('public-config')
@PublicRoute()
export class PublicConfigController {
  constructor(private readonly publicConfigService: PublicConfigService) {}

  @Get('payment-instructions')
  getPaymentInstructions() {
    return this.publicConfigService.getPaymentInstructions();
  }
}
