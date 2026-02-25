import { Injectable } from '@nestjs/common';
import { OAuthAccount, Prisma } from 'generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { GenericRepository } from '@/common/repository';
import {
  IOAuthAccountRepository,
  OAuthAccountWithUser,
} from './oauth-account.repository.interface';

@Injectable()
export class OAuthAccountRepository
  extends GenericRepository<OAuthAccount>
  implements IOAuthAccountRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, Prisma.ModelName.OAuthAccount);
  }

  async findByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountWithUser | null> {
    return this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
  }
}
