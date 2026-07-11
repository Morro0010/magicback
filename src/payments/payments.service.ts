import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentsService {
  getPaymentMethods(): string[] {
    return ['TRANSFER', 'CASH'];
  }
}
