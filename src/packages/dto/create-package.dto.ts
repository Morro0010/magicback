import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  features!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
