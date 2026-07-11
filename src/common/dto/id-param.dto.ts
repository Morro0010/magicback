import { IsString, Length } from 'class-validator';

export class IdParamDto {
  @IsString()
  @Length(8, 64)
  id!: string;
}
