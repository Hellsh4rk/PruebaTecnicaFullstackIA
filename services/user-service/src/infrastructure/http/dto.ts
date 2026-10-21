import { IsEmail, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateUserDto {
  @IsUUID()
  id!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 120)
  fullName!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;
}

export class ListUsersQuery {
  @IsOptional()
  @IsString()
  @Length(0, 120)
  search?: string;

  @IsOptional()
  @Min(1)
  page?: number;

  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;
}
