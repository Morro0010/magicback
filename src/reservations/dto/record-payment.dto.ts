import { PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class RecordPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}
