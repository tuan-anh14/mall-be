import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'electronics' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({ example: 'Laptop' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}

export class CreateCouponDto {
  @ApiProperty({ example: 'SUMMER20' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ enum: ['PERCENTAGE', 'FIXED_AMOUNT'] })
  @IsEnum(['PERCENTAGE', 'FIXED_AMOUNT'])
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value: number;

  @ApiPropertyOptional({ example: 100 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  minOrderAmount?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  maxDiscount?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  usageLimit?: number;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z' })
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ enum: ['PERCENTAGE', 'FIXED_AMOUNT'] })
  @IsEnum(['PERCENTAGE', 'FIXED_AMOUNT'])
  @IsOptional()
  type?: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  value?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  maxDiscount?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  usageLimit?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ReviewSellerRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  adminNote?: string;
}
