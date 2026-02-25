import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserType } from 'generated/prisma/client';

@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({ example: 'cuid-123' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'jane.smith@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @Expose()
  @ApiProperty({ example: 'Smith' })
  lastName: string;

  @Expose()
  @ApiProperty({ enum: UserType, example: UserType.BUYER })
  userType: UserType;

  @Expose()
  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ example: '2024-01-20T14:45:00Z' })
  updatedAt: Date;
}

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  items: UserResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 100 })
  total: number;
}
