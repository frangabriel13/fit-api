import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, UserDto } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Solo el header. El front guarda el token en una cookie no-httpOnly,
      // pero el contrato dice explícitamente que la API no debe depender de ella.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Se relee el usuario en cada request en vez de confiar en el payload: si lo
   * borraron o le cambiaron el rol, el token viejo deja de servir enseguida.
   */
  async validate(payload: JwtPayload): Promise<UserDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mustChangePassword: true,
      },
    });

    // Token bien firmado pero el usuario ya no existe, o le dieron de baja: es
    // un problema de autenticación, no de permisos. 401 y a login. Como el
    // usuario se relee en cada request, la baja corta las sesiones abiertas al
    // instante en vez de esperar a que venza el token.
    if (!user) throw new UnauthorizedException('Sesión inválida');

    return user;
  }
}
