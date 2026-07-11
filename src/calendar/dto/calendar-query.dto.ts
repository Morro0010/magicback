import { IsDateString, IsOptional } from 'class-validator';

export class CalendarQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
