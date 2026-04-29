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
}

export class CreateDepositDto {
  @ApiProperty({ description: 'Số tiền nạp (VND)', minimum: 10000, maximum: 500000000 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Số tiền nạp phải là một số' })
  @IsPositive({ message: 'Số tiền nạp phải là số dương' })
  @Min(10000, { message: 'Số tiền nạp tối thiểu là 10.000đ' })
  @Max(500000000, { message: 'Số tiền nạp không được vượt quá 500.000.000đ' })
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

export class CreateWithdrawDto {
  @ApiProperty({ description: 'Số tiền rút (VND)', minimum: 10000 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Số tiền rút phải là một số' })
  @IsPositive({ message: 'Số tiền rút phải là số dương' })
  @Min(50000, { message: 'Số tiền rút tối thiểu là 50.000đ' })
  amount: number;

  @ApiProperty({ description: 'ID phương thức thanh toán/ngân hàng đã lưu' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Tên ngân hàng (nếu chưa lưu)' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Số tài khoản (nếu chưa lưu)' })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional({ description: 'Tên chủ tài khoản (nếu chưa lưu)' })
  @IsOptional()
  @IsString()
  accountHolder?: string;
}

export class WalletStatsDto {
  balance: number;
  totalIncome: number;    // Gross (Income + Fee)
  netIncome: number;      // Actual (Income)
  totalFees: number;      // 5% fees
  totalSpent: number;     // Expenses
  totalWithdrawn: number; 
  totalRefunded: number;
  totalDeposited: number;
}
