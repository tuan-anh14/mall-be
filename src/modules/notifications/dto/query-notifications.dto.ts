import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';

export class QueryNotificationsDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['ORDER', 'SALE', 'WISHLIST', 'PROMOTION', 'SYSTEM'],
  })
  @IsOptional()
  @IsIn(['ORDER', 'SALE', 'WISHLIST', 'PROMOTION', 'SYSTEM'])
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isRead?: boolean;
}
