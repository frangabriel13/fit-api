import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, LoginResponseDto, UserDto } from './auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Mismo error para "no existe" y "contraseña incorrecta": no hay que
    // revelar qué emails están registrados.
    const valid = user && (await this.verify(user.password, password));
    if (!user || !valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const safe: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return { accessToken: await this.jwt.signAsync(payload), user: safe };
  }

  /** Un hash corrupto en la base no debe tumbar el request: es login fallido. */
  private async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  static hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }
}
