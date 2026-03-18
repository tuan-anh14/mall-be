import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DepositGateway {
  VNPAY = 'VNPAY',
  MOMO = 'MOMO',
}

export class CreateDepositDto {
  @ApiProperty({ description: 'Số tiền nạp (USD)', minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(10000)
  amount: number;

  @ApiProperty({ enum: DepositGateway })
  @IsEnum(DepositGateway)
  gateway: DepositGateway;

  @ApiPropertyOptional({ description: 'URL redirect sau khi thanh toán thành công' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class AdminAdjustWalletDto {
  @ApiProperty({ description: 'Số tiền điều chỉnh (dương = cộng, âm = trừ)' })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Lý do điều chỉnh' })
  @IsString()
  reason: string;
}

export class QueryWalletTransactionsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class QueryAdminWalletsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Tìm theo email hoặc số điện thoại' })
  @IsOptional()
  @IsString()
  search?: string;
}
