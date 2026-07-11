import { SpecialEventStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSpecialEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsDateString()
  eventDate!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  childPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  adultPrice!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacityMax!: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  imageUrl?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3000)
  includesText!: string;

  @IsOptional()
  @IsEnum(SpecialEventStatus)
  status?: SpecialEventStatus;
}
