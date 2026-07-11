import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
