import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BlogStatus } from 'generated/prisma/client';
import { PaginationDto } from '@/common/dto/pagination.dto';

export class BlogQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search by title' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BlogStatus, description: 'Filter by status (admin only)' })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;
}
