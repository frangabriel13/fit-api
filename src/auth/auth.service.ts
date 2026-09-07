import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { normalizeEmail } from '../common/email';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, LoginResponseDto, TokensDto, UserDto } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, verifyPassword } from './password';
import { RefreshTokensService } from './refresh-tokens.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  /** Firma el access token de un usuario, con su generación actual. */
  private async accessToken(user: {
    id: string;
    email: string;
    role: UserDto['role'];
    tokenVersion: number;
  }): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ver: user.tokenVersion,
    };
    return this.jwt.signAsync(payload);
  }

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
    return {
      accessToken: await this.accessToken(user),
      refreshToken: await this.refreshTokens.emitir(user.id),
      user: safe,
    };
  }

  /**
   * Canjea el refresh token por un par nuevo. El viejo queda revocado (rotación).
   *
   * Vuelve a leer al usuario en vez de confiar en el token: si le dieron de
   * baja, el refresh no puede resucitarlo.
   */
  async refresh(refreshToken: string): Promise<TokensDto> {
    const { userId, nuevo } = await this.refreshTokens.rotar(refreshToken);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    if (!user) throw new UnauthorizedException('Sesión inválida');

    return { accessToken: await this.accessToken(user), refreshToken: nuevo };
  }

  /** Cierra la sesión de ESTE dispositivo: revoca su refresh token. */
  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) await this.refreshTokens.revocar(refreshToken);
  }

  /**
   * Cierra TODAS las sesiones, incluida la que hace el pedido.
   *
   * El corte sobre `tokensValidFrom` es lo que mata a los access tokens ya
   * emitidos: revocar los refresh solos no alcanzaría, porque un access token
   * seguiría sirviendo hasta vencer.
   */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revocarTodos(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
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
  ): Promise<TokensDto> {
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

    // Cambiar la contraseña cierra todas las sesiones: si no, un token robado
    // sobreviviría al cambio hasta vencer, que era justamente el agujero.
    await this.refreshTokens.revocarTodos(userId);

    const actualizado = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await hashPassword(newPassword),
        // Ya la eligió el propio usuario: deja de ser provisoria.
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });

    // Y se le devuelve un par nuevo —ya con la generación nueva—, para que el
    // que cambió la contraseña no termine expulsado al login por hacer lo
    // correcto. Las sesiones de los otros dispositivos sí quedan cerradas.
    return {
      accessToken: await this.accessToken(actualizado),
      refreshToken: await this.refreshTokens.emitir(userId),
    };
  }
}
