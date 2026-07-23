import {
  IsDateString,
  IsInt,
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
import { TIME_FORMAT_REGEX } from '../../common/constants';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import { EventFormDto } from '../../reservations/dto/event-form.dto';

export class UpdatePublicReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  celebrantName?: string;

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
  @Transform(({ value }: TransformFnParams): unknown =>
    value === '' ? undefined : value,
  )
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
  @IsObject()
  @ValidateNested()
  @Type(() => EventFormDto)
  eventForm?: EventFormDto;
}
