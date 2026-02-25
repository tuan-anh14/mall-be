import { User } from 'generated/prisma/client';
import { IRepository } from '@/common/repository';

export interface IUsersRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('IUsersRepository');
