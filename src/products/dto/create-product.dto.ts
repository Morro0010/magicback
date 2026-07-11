import { ProductCategory, ProductUnit } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(140)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsEnum(ProductCategory)
  category!: ProductCategory;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice!: number;

  @IsInt()
  stockCurrent!: number;

  @IsOptional()
  @IsInt()
  stockMin?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsEnum(ProductUnit)
  unit!: ProductUnit;
}
