import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAdjustmentDto {
  @IsString()
  productId!: string;

  @IsInt()
  quantityDelta!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  forceNegativeStock?: boolean;
}
