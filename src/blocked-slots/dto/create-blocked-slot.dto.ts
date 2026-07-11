import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TIME_FORMAT_REGEX } from '../../common/constants';

export class CreateBlockedSlotDto {
  @IsDateString()
  date!: string;

  @Matches(TIME_FORMAT_REGEX, { message: 'startTime must use HH:mm' })
  startTime!: string;

  @Matches(TIME_FORMAT_REGEX, { message: 'endTime must use HH:mm' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
