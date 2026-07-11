import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendSaleWhatsAppDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}
