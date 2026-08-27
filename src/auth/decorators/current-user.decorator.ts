import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { UserDto } from '../auth.types';

/** Inyecta el usuario autenticado que dejó JwtStrategy en el request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDto =>
    ctx.switchToHttp().getRequest<{ user: UserDto }>().user,
);
