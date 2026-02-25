import { User, UserSession } from 'generated/prisma/client';
import { IRepository } from '@/common/repository';

export type UserSessionWithUser = UserSession & { user: User };

export interface IUserSessionRepository extends IRepository<UserSession> {
  findByIdWithUser(id: string): Promise<UserSessionWithUser | null>;
}

export const USER_SESSION_REPOSITORY = Symbol('IUserSessionRepository');
