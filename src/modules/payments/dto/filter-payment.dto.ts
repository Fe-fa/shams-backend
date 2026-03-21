import {
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { PaymentStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';

export class FilterPaymentDto {
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  patientId?: number;

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}