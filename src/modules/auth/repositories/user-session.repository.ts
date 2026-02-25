import { Injectable } from '@nestjs/common';
import { Prisma, UserSession } from 'generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { GenericRepository } from '@/common/repository';
import {
  IUserSessionRepository,
  UserSessionWithUser,
} from './user-session.repository.interface';

@Injectable()
export class UserSessionRepository
  extends GenericRepository<UserSession>
  implements IUserSessionRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, Prisma.ModelName.UserSession);
  }

  async findByIdWithUser(id: string): Promise<UserSessionWithUser | null> {
    return this.prisma.userSession.findUnique({
      where: { id },
      include: { user: true },
    });
  }
}
