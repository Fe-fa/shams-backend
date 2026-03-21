import {
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  Matches,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @IsInt()
  @Type(() => Number)
  appointmentId: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  serviceId?: number;

  @ValidateIf((o) => o.method === PaymentMethod.MOBILE_MONEY)
  @IsString()
  @Matches(/^(\+?254|0)?(7|1)\d{8}$/, {
    message:
      'phoneNumber must be a valid Kenyan mobile number e.g. 0712345678 or +254712345678',
  })
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  externalRef?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}