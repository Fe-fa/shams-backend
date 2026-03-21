import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class UpdateUserDto {
  // ── Personal ──
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  address?: string;

  // ── Medical (PATIENT) ─
  @IsString()
  @IsOptional()
  bloodType?: string;

  @IsString()
  @IsOptional()
  allergies?: string;

  @IsString()
  @IsOptional()
  medicalHistory?: string;

  // ── Professional (DOCTOR / NURSE) ──
  @IsString()
  @IsOptional()
  specialization?: string;

  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @IsOptional()
  department?: string;

  // ── Admin-only 
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
