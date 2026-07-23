import { SpecialEventAttendeeType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SpecialEventAttendeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(SpecialEventAttendeeType)
  type!: SpecialEventAttendeeType;
}

export class CreateSpecialEventReservationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  holderName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(40)
  holderPhone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  holderEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;

  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SpecialEventAttendeeDto)
  attendees!: SpecialEventAttendeeDto[];
}
