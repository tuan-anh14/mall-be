import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class TrackViewDto {
  @ApiProperty()
  @IsString()
  productId: string;
}
