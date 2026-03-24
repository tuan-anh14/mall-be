import { IsNotEmpty, IsString, MaxLength, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReplyDto {
  @ApiProperty({ description: 'Reply content', maxLength: 1000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  comment: string;

  @ApiProperty({ description: 'Reply images', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
