import { IsDateString, IsOptional } from 'class-validator';

export class FinanceRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
