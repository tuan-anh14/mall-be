import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';
import { ReturnRequestStatus } from 'generated/prisma/client';

export class UpdateReturnRequestStatusDto {
  @IsEnum(ReturnRequestStatus)
  status: ReturnRequestStatus;

  @IsString()
  @IsOptional()
  sellerNote?: string;

  @IsNumber()
  @IsOptional()
  refundAmount?: number;
}
