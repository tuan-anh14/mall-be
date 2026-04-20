import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStockDto {
  @ApiProperty({ example: 10, description: 'Product stock quantity' })
  @IsInt()
  @Min(0)
  stock: number;
}
