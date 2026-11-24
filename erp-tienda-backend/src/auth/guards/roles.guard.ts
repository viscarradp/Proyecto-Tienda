import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MENSAJE_SOLO_DUENA } from '../../common/permisos';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user: { rol: string } }>();
    const user = request.user;

    if (!user || !user.rol || !requiredRoles.includes(user.rol)) {
      throw new ForbiddenException(MENSAJE_SOLO_DUENA);
    }
    return true;
  }
}
