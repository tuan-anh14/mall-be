import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType } from 'generated/prisma/client';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.userType !== UserType.ADMIN) {
      throw new ForbiddenException('Yêu cầu quyền Admin');
    }
    return true;
  }
}
