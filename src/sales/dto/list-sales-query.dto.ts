import { PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ListSalesQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
