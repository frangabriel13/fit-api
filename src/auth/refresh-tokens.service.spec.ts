import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import type { PrismaService } from '../prisma/prisma.service';
import { RefreshTokensService } from './refresh-tokens.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** El primer argumento de la primera llamada, tipado: `mock.calls` es `any[]`. */
const primerArg = <T>(fn: jest.Mock): T => (fn.mock.calls[0] as [T])[0];

interface Fila {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  replacedById: string | null;
}

function armar(fila?: Fila) {
  const refreshToken = {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(fila ?? null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = { refreshToken } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  return { service: new RefreshTokensService(prisma, config), refreshToken };
}

const vigente = (over: Partial<Fila> = {}): Fila => ({
  id: 'fila-1',
  userId: 'u-1',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86_400_000),
  replacedById: null,
  ...over,
});

describe('RefreshTokensService.emitir', () => {
  it('guarda el HASH, nunca el token en claro', async () => {
    const { service, refreshToken } = armar();
    const token = await service.emitir('u-1');

    const { data: guardado } = primerArg<{ data: { tokenHash: string } }>(
      refreshToken.create,
    );
    expect(guardado.tokenHash).toBe(sha256(token));
    expect(guardado.tokenHash).not.toBe(token);
    // Si se filtra la base, estos hashes no sirven para entrar.
    expect(JSON.stringify(refreshToken.create.mock.calls)).not.toContain(token);
  });

  it('devuelve tokens distintos cada vez', async () => {
    const { service } = armar();
    const a = await service.emitir('u-1');
    const b = await service.emitir('u-1');
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it('limpia los vencidos de ese usuario: si no, la tabla crece sin techo', async () => {
    const { service, refreshToken } = armar();
    await service.emitir('u-1');

    const { where } = primerArg<{
      where: { userId: string; expiresAt: { lte: Date } };
    }>(refreshToken.deleteMany);
    expect(where.userId).toBe('u-1');
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
  });
});

describe('RefreshTokensService.rotar', () => {
  it('lo busca por hash, no por el valor en claro', async () => {
    const { service, refreshToken } = armar(vigente());
    await service.rotar('el-token');

    expect(
      primerArg<{ where: unknown }>(refreshToken.findUnique).where,
    ).toEqual({ tokenHash: sha256('el-token') });
  });

  it('feliz: emite otro y revoca el usado apuntando al nuevo', async () => {
    const { service, refreshToken } = armar(vigente());
    const { userId, nuevo } = await service.rotar('viejo');

    expect(userId).toBe('u-1');
    const { data } = primerArg<{
      data: { revokedAt: Date; replacedById: string };
    }>(refreshToken.update);
    expect(data.revokedAt).toBeInstanceOf(Date);
    // `replacedById` es lo que después distingue un reuso de un reintento.
    expect(data.replacedById).toBe(sha256(nuevo));
  });

  it('inexistente -> 401, y no cierra nada', async () => {
    const { service, refreshToken } = armar(undefined);
    await expect(service.rotar('no-existe')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('vencido -> 401, y no cierra nada', async () => {
    const { service, refreshToken } = armar(
      vigente({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.rotar('viejo')).rejects.toThrow(UnauthorizedException);
    expect(refreshToken.updateMany).not.toHaveBeenCalled();
  });

  describe('revocado', () => {
    it('CON replacedById es reuso: cierra TODAS las sesiones', async () => {
      // Alguien se quedó con una copia de un token que el dueño ya canjeó.
      const { service, refreshToken } = armar(
        vigente({ revokedAt: new Date(), replacedById: 'hash-del-nuevo' }),
      );

      await expect(service.rotar('copiado')).rejects.toThrow(/ya usado/);
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('SIN replacedById es un logout: 401 pero NO echa a los demás', async () => {
      // Un dispositivo viejo reintentando después de un logout o un cambio de
      // contraseña. Si esto cerrara todo, cambiar la clave en la compu con el
      // celular abierto echaría a los dos.
      const { service, refreshToken } = armar(
        vigente({ revokedAt: new Date(), replacedById: null }),
      );

      await expect(service.rotar('deslogueado')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('RefreshTokensService.revocar', () => {
  it('revoca solo el que corresponde, y solo si sigue vigente', async () => {
    const { service, refreshToken } = armar();
    await service.revocar('el-token');

    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('el-token'), revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('no falla con un token que no existe: cerrar sesión no puede fallar', async () => {
    const { service } = armar();
    await expect(service.revocar('cualquier-cosa')).resolves.toBeUndefined();
  });
});
