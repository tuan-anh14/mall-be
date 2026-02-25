import { Injectable } from '@nestjs/common';
import { PasswordReset, Prisma } from 'generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { GenericRepository } from '@/common/repository';
import { IPasswordResetRepository } from './password-reset.repository.interface';

@Injectable()
export class PasswordResetRepository
  extends GenericRepository<PasswordReset>
  implements IPasswordResetRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, Prisma.ModelName.PasswordReset);
  }

  async findByToken(token: string): Promise<PasswordReset | null> {
    return this.model.findUnique({ where: { token } });
  }
}
