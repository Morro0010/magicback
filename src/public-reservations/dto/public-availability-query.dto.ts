import { IsDateString } from 'class-validator';

export class PublicAvailabilityQueryDto {
  @IsDateString()
  date!: string;
}
