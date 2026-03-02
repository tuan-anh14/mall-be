import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ description: 'Seller user ID' })
  @IsString()
  sellerId: string;

  @ApiPropertyOptional({ description: 'Product ID (optional)' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Initial message' })
  @IsOptional()
  @IsString()
  message?: string;
}
