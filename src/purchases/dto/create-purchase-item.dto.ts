import { IsInt, IsNumber, IsString, Min } from 'class-validator';

export class CreatePurchaseItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCostPrice!: number;
}
