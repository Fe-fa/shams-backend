import { IsString, IsNotEmpty, Matches, IsNumber } from 'class-validator';

export class StkPushDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^254\d{9}$/, {
    message: 'Phone number must be in format 2547XXXXXXXX',
  })
  phoneNumber: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  accountReference: string;
}