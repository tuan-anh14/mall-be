import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  IUserSessionRepository,
  USER_SESSION_REPOSITORY,
} from '@/modules/auth/repositories/user-session.repository.interface';
import { SESSION_COOKIE } from '../constants/routes.constant';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_SESSION_REPOSITORY)
    private readonly userSessionRepository: IUserSessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const sessionId = request.cookies?.[SESSION_COOKIE] as string | undefined;

    if (!sessionId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const session =
      await this.userSessionRepository.findByIdWithUser(sessionId);

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.user = session.user;
    return true;
  }
}
