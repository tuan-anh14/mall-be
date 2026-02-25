import { PrismaService } from '@/database/prisma.service';
import { GenericRepository } from '@/common/repository';
import { Injectable } from '@nestjs/common';
import { Prisma, User } from 'generated/prisma/client';
import { IUsersRepository } from './users.repository.interface';

@Injectable()
export class UsersRepository
  extends GenericRepository<User>
  implements IUsersRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, Prisma.ModelName.User);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.model.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return await this.model.findUnique({ where: { id } });
  }
}
