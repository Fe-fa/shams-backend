import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';
import { AppointmentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateServiceDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsEnum(AppointmentType)
  @IsOptional()
  type?: AppointmentType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}