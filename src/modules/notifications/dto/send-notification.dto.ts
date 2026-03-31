import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class SendNotificationDto {
  @Type(() => Number)
  @IsInt()
  notificationId: number;
}
