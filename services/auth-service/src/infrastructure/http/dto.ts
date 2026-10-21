import { IsEmail, IsString, IsUUID, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @Length(20, 2000)
  refreshToken!: string;
}

export class RegisterCredentialDto {
  @IsUUID()
  userId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  password!: string;
}

export class ChangeEmailDto {
  @IsEmail()
  email!: string;
}
