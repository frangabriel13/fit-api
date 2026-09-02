import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { normalizeEmail } from '../common/email';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, LoginResponseDto, UserDto } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto): Promise<LoginResponseDto> {
    // La baja es lógica: el usuario sigue en la base con su historial, pero no
    // entra más. Se busca con findFirst y no findUnique porque el filtro deja
    // de ser solo la clave única.
    const user = await this.prisma.user.findFirst({
      where: { email: normalizeEmail(email), deletedAt: null },
    });

    // Mismo error para "no existe" y "contraseña incorrecta": no hay que
    // revelar qué emails están registrados.
    const valid = user && (await verifyPassword(user.password, password));
    if (!user || !valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const safe: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return { accessToken: await this.jwt.signAsync(payload), user: safe };
  }

  /**
   * Cambio de contraseña del propio usuario.
   *
   * Hace falta para que el alta cierre: al cliente lo da de alta el entrenador
   * con una contraseña provisoria, así que el cliente tiene que poder
   * cambiarla — si no, el entrenador se queda sabiendo su contraseña para
   * siempre.
   *
   * OJO con el código de error: la contraseña actual equivocada devuelve 400,
   * NO 401. Un 401 acá le borraría el token al usuario y lo mandaría al login
   * por haberse equivocado tipeando, que es justo lo que el contrato no
   * quiere. La sesión es válida; lo que está mal es el body.
   */
  async changePassword(
    userId: string,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    // El token es válido pero el usuario ya no está: eso sí es 401.
    if (!user) throw new UnauthorizedException('Sesión inválida');

    if (!(await verifyPassword(user.password, currentPassword))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('La contraseña nueva no puede ser igual');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await hashPassword(newPassword),
        // Ya la eligió el propio usuario: deja de ser provisoria.
        mustChangePassword: false,
      },
    });
  }
}
