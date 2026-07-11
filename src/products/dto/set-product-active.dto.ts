import { IsBoolean } from 'class-validator';

export class SetProductActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
