import { IsDateString, Matches } from 'class-validator';
import { TIME_FORMAT_REGEX } from '../../common/constants';

export class ReassignReservationDto {
  @IsDateString()
  eventDate!: string;

  @Matches(TIME_FORMAT_REGEX, { message: 'startTime must use HH:mm' })
  startTime!: string;

  @Matches(TIME_FORMAT_REGEX, { message: 'endTime must use HH:mm' })
  endTime!: string;
}
