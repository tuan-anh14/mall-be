import { OAuthAccount, User } from 'generated/prisma/client';
import { IRepository } from '@/common/repository';

export type OAuthAccountWithUser = OAuthAccount & { user: User };

export interface IOAuthAccountRepository extends IRepository<OAuthAccount> {
  findByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountWithUser | null>;
}

export const OAUTH_ACCOUNT_REPOSITORY = Symbol('IOAuthAccountRepository');
