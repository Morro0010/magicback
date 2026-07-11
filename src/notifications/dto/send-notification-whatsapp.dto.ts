import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendNotificationWhatsAppDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  text?: string;
}
