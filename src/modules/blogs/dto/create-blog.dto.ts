import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BlogStatus } from 'generated/prisma/client';

export class CreateBlogDto {
  @ApiProperty({ description: 'Blog post title', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Rich text HTML content from TipTap editor' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  content: string;

  @ApiPropertyOptional({ description: 'Short summary for SEO / card display', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({ description: 'Cover image URL (Cloudinary)' })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiProperty({ description: 'Blog category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({
    enum: BlogStatus,
    default: BlogStatus.DRAFT,
    description: 'DRAFT = save, PENDING = submit for review',
  })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;
}
