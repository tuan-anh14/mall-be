import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['Processing', 'Shipped', 'Delivered'] })
  @IsIn(['Processing', 'Shipped', 'Delivered'])
  status: string;
}
