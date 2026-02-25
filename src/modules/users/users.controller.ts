import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/users.response.dto';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from '@/common/dto/pagination.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Users list' })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.usersService.getAll(pagination.page, pagination.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.usersService.getFindById(id);
    if (!user) throw new NotFoundException('User not found');
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}
