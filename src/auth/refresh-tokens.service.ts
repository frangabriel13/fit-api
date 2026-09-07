import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

/** Días que dura un refresh token si no se configura otra cosa. */
const DIAS_POR_DEFECTO = 30;

/**
 * Sesiones de larga duración, una por dispositivo.
 *
 * El access token es un JWT stateless: rápido de validar pero imposible de
 * revocar de a uno. El refresh es lo contrario —una fila en la base—, así que
 * es el que permite cerrar la sesión de un dispositivo sin tocar los demás.
 *
 * Se guarda el SHA-256 y no el valor en claro. Alcanza con un hash rápido
 * porque esto no es una contraseña: son 32 bytes aleatorios, no hay nada que
 * adivinar por fuerza bruta y sí hace falta poder buscarlo por índice. Argon2
 * acá solo agregaría latencia.
 */
@Injectable()
export class RefreshTokensService {
  private readonly dias: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.dias = config.get<number>('REFRESH_EXPIRES_DAYS') ?? DIAS_POR_DEFECTO;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Emite uno nuevo y devuelve el valor en claro, que solo ve el cliente. */
  async emitir(userId: string): Promise<string> {
    await this.limpiarVencidos(userId);

    const token = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(token),
        userId,
        expiresAt: new Date(Date.now() + this.dias * 86_400_000),
      },
    });
    return token;
  }

  /**
   * Borra los ya vencidos de ese usuario. Sin esto la tabla crece sin techo:
   * cada login deja una fila y nada la saca nunca.
   *
   * Solo los VENCIDOS, nunca los revocados que siguen vigentes: un revocado al
   * rotar es justamente la evidencia que detecta el reuso, y borrarlo
   * convertiría un reuso en un simple "no existe". Una vez vencido ya no sirve
   * para nada, así que ahí sí se puede tirar.
   *
   * Va acá, colgado del login y del refresh, para no depender de un cron.
   */
  private async limpiarVencidos(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lte: new Date() } },
    });
  }

  /**
   * Canjea un refresh token por otro y devuelve a quién pertenece.
   *
   * ROTACIÓN: el usado queda revocado apuntando al nuevo. Si más tarde llega
   * otro uso del mismo, es que alguien se quedó con una copia —el dueño
   * legítimo ya lo cambió—, así que se cierran TODAS las sesiones del usuario
   * en vez de solo rechazar el pedido. Es la única señal disponible de que la
   * cadena se filtró, y perder las sesiones es preferible a dejar viva la del
   * que copió.
   */
  async rotar(token: string): Promise<{ userId: string; nuevo: string }> {
    const fila = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        replacedById: true,
      },
    });

    if (!fila) throw new UnauthorizedException('Refresh token inválido');

    if (fila.revokedAt) {
      // Revocado NO alcanza para gritar reuso: un logout o un cambio de
      // contraseña también revocan, y ahí que un dispositivo viejo reintente es
      // lo normal, no un ataque. Si eso cerrara todas las sesiones, cambiar la
      // contraseña en la compu y tener el celular abierto se echaría a los dos.
      // El reuso de verdad es el de un token que ya fue CANJEADO: solo esos
      // tienen `replacedById`.
      if (fila.replacedById) {
        await this.revocarTodos(fila.userId);
        throw new UnauthorizedException(
          'Refresh token ya usado: se cerraron todas las sesiones',
        );
      }
      throw new UnauthorizedException('Sesión cerrada: volvé a entrar');
    }
    if (fila.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token vencido');
    }

    const nuevo = await this.emitir(fila.userId);
    await this.prisma.refreshToken.update({
      where: { id: fila.id },
      data: {
        revokedAt: new Date(),
        replacedById: this.hash(nuevo),
      },
    });
    return { userId: fila.userId, nuevo };
  }

  /**
   * Revoca uno solo: es el logout de ESTE dispositivo.
   *
   * No falla si el token no existe o ya estaba revocado. Cerrar sesión tiene
   * que terminar bien siempre: un 4xx acá dejaría al front sin saber qué hacer
   * con una sesión que igual va a descartar.
   */
  async revocar(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoca todas las de un usuario. */
  async revocarTodos(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
