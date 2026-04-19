import { IsString, IsArray, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateReturnRequestDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}
