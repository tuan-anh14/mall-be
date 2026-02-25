import { Inject, Injectable } from '@nestjs/common';
import { User } from 'generated/prisma/client';
import { plainToInstance } from 'class-transformer';
import {
  IUsersRepository,
  USER_REPOSITORY,
} from './repositories/users.repository.interface';
import {
  PaginatedUsersResponseDto,
  UserResponseDto,
} from './dto/users.response.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly usersRepository: IUsersRepository,
  ) {}

  async getUserByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async getFindById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async getAll(
    page: number,
    limit: number,
  ): Promise<PaginatedUsersResponseDto> {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.usersRepository.findAll({ skip, take: limit }),
      this.usersRepository.count(),
    ]);

    return {
      items: plainToInstance(UserResponseDto, users, {
        excludeExtraneousValues: true,
      }),
      page,
      limit,
      total,
    };
  }
}
