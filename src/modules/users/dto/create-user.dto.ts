import { IsEmail, IsString, MinLength, IsEnum, IsOptional, Matches, IsBoolean } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone must be valid (e.g. +254712345678)' })
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsOptional()
  specialization?: string;

  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @IsOptional()
  department?: string;

  /** When true, backend sends invite/verification email */
  @IsBoolean()
  @IsOptional()
  sendInviteEmail?: boolean;
}