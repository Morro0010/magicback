import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  internalNotes?: string;
}
