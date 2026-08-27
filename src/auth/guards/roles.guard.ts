import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { UserDto } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Chequea el rol de un usuario YA autenticado.
 *
 * Siempre 403, nunca 401: un 401 acá desloguearía a alguien que sí tiene
 * sesión válida, solo que no permiso para este recurso.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: UserDto }>();

    // Sin usuario en el request el endpoint es público pero pide rol: eso es
    // un error de configuración nuestro, no del cliente.
    if (!user) throw new ForbiddenException('Sin permiso para este recurso');

    if (!required.includes(user.role)) {
      throw new ForbiddenException('Sin permiso para este recurso');
    }
    return true;
  }
}
