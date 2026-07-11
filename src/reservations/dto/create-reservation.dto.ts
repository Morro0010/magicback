import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod, ReservationStatus } from '@prisma/client';
import { TIME_FORMAT_REGEX } from '../../common/constants';
import { EventFormDto } from './event-form.dto';

export class CreateReservationDto {
  @IsString()
  @MaxLength(120)
  celebrantName!: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @Matches(TIME_FORMAT_REGEX, { message: 'startTime must use HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_FORMAT_REGEX, { message: 'endTime must use HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  attendeesCount?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @Length(8, 64)
  packageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  theme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  foodDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2400)
  notes?: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  advanceAmount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  advancePaymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsBoolean()
  quickCapture?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EventFormDto)
  eventForm?: EventFormDto;
}
