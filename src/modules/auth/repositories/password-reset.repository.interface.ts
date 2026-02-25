import { PasswordReset } from 'generated/prisma/client';
import { IRepository } from '@/common/repository';

export interface IPasswordResetRepository extends IRepository<PasswordReset> {
  findByToken(token: string): Promise<PasswordReset | null>;
}

export const PASSWORD_RESET_REPOSITORY = Symbol('IPasswordResetRepository');
