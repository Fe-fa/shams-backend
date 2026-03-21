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

export class CreateServiceDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsEnum(AppointmentType)
  type: AppointmentType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}