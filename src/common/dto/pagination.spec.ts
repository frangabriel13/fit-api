import { paginar } from './pagination.dto';
import { targetUserId } from './target-user.dto';

describe('paginar', () => {
  it('sin parámetros no recorta nada: el contrato pide arrays enteros', () => {
    expect(paginar({})).toEqual({});
  });

  it('traduce limit y offset a los nombres de Prisma', () => {
    expect(paginar({ limit: 10, offset: 20 })).toEqual({ take: 10, skip: 20 });
  });

  it('acepta uno solo de los dos', () => {
    expect(paginar({ limit: 5 })).toEqual({ take: 5 });
    expect(paginar({ offset: 5 })).toEqual({ skip: 5 });
  });

  it('offset 0 se manda: es un valor, no una ausencia', () => {
    expect(paginar({ offset: 0 })).toEqual({ skip: 0 });
  });
});

describe('targetUserId', () => {
  it('el nombre canónico es `userId`', () => {
    expect(targetUserId({ userId: 'u1' })).toBe('u1');
  });

  it('`clientId` sirve como alias: antes se descartaba en silencio', () => {
    expect(targetUserId({ clientId: 'c1' })).toBe('c1');
  });

  it('si vienen los dos gana el canónico', () => {
    expect(targetUserId({ userId: 'u1', clientId: 'c1' })).toBe('u1');
  });

  it('sin ninguno devuelve undefined, que el servicio lee como "yo"', () => {
    expect(targetUserId({})).toBeUndefined();
  });
});
