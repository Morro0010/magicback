import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PublicConfigService {
  constructor(private readonly configService: ConfigService) {}

  getPaymentInstructions() {
    return {
      bankName: this.configService.getOrThrow<string>('PAYMENT_BANK_NAME'),
      accountHolder: this.configService.getOrThrow<string>(
        'PAYMENT_ACCOUNT_HOLDER',
      ),
      accountNumber: this.configService.getOrThrow<string>(
        'PAYMENT_ACCOUNT_NUMBER',
      ),
      clabe: this.configService.getOrThrow<string>('PAYMENT_CLABE'),
      referenceHint: this.configService.getOrThrow<string>(
        'PAYMENT_REFERENCE_HINT',
      ),
      businessWhatsapp:
        this.configService.get<string>('WHATSAPP_BUSINESS_PHONE') ||
        this.configService.getOrThrow<string>('BUSINESS_WHATSAPP'),
      businessPhone: this.configService.getOrThrow<string>('BUSINESS_PHONE'),
      businessEmail: this.configService.getOrThrow<string>('BUSINESS_EMAIL'),
    };
  }
}
