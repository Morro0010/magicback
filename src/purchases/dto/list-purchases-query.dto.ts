import { IsDateString, IsOptional } from 'class-validator';

export class ListPurchasesQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
