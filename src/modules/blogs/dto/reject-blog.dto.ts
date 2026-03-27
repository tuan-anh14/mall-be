import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectBlogDto {
  @ApiProperty({ description: 'Reason for rejection shown to the author' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
