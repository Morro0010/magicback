import { BirthdayFollowUpStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBirthdayFollowUpDto {
  @IsEnum(BirthdayFollowUpStatus)
  status!: BirthdayFollowUpStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;
}
