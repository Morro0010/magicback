import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentMethodsResponseDto } from './dto/payment-methods-response.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('methods')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  getMethods(): PaymentMethodsResponseDto {
    return {
      methods: this.paymentsService.getPaymentMethods(),
    };
  }
}
