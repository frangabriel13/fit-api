import { BadRequestException } from '@nestjs/common';

import { aplicarReorden, planDeReorden, type Ordenable } from './reorder';

/**
 * El plan de reorden es puro y su parte delicada —las dos fases— no se puede
 * observar desde afuera: el e2e solo ve el resultado final. Acá se mira el plan
 * en sí, que es donde está la aritmética que evita chocar con el índice.
 */
describe('planDeReorden', () => {
  const items = (...orders: number[]): Ordenable[] =>
    orders.map((order, i) => ({ id: `id${i}`, order }));

  describe('numeración final', () => {
    it('renumera desde el mínimo que ya había, sin huecos', () => {
      const actuales = items(5, 6, 7);
      const plan = planDeReorden(actuales, ['id2', 'id0', 'id1']);

      expect(plan.map((p) => p.id)).toEqual(['id2', 'id0', 'id1']);
      expect(plan.map((p) => p.final)).toEqual([5, 6, 7]);
    });

    it('los microciclos arrancan en 1 porque su order ES la semana', () => {
      const plan = planDeReorden(items(1, 2, 3), ['id1', 'id2', 'id0']);
      expect(plan.map((p) => p.final)).toEqual([1, 2, 3]);
    });

    it('los días y ejercicios que arrancan en 0 se quedan en 0', () => {
      const plan = planDeReorden(items(0, 1), ['id1', 'id0']);
      expect(plan.map((p) => p.final)).toEqual([0, 1]);
    });

    it('se lleva puestos los huecos y los empates', () => {
      // Empate en 1 y un salto hasta 9: el editor dejaba tocar el campo a mano.
      const plan = planDeReorden(items(1, 1, 9), ['id0', 'id1', 'id2']);
      expect(plan.map((p) => p.final)).toEqual([1, 2, 3]);
    });

    it('con un solo elemento no explota', () => {
      expect(planDeReorden(items(7), ['id0'])).toEqual([
        { id: 'id0', final: 7, temp: expect.any(Number) as number },
      ]);
    });
  });

  describe('las dos fases no pueden chocar con el índice único', () => {
    it('todo temp queda por encima de todo order actual y de todo final', () => {
      const actuales = items(0, 1, 2, 3);
      const plan = planDeReorden(actuales, ['id3', 'id2', 'id1', 'id0']);

      const techo = Math.max(
        ...actuales.map((a) => a.order),
        ...plan.map((p) => p.final),
      );
      for (const paso of plan) expect(paso.temp).toBeGreaterThan(techo);
    });

    it('los temp son todos distintos entre sí', () => {
      const plan = planDeReorden(items(0, 1, 2), ['id2', 'id1', 'id0']);
      const temps = plan.map((p) => p.temp);
      expect(new Set(temps).size).toBe(temps.length);
    });

    it('el intercambio de dos vecinos, que es el caso que rompía', () => {
      const plan = planDeReorden(items(0, 1), ['id1', 'id0']);

      // Fase 1: los dos salen del rango final. Fase 2: entran a su lugar.
      expect(plan.every((p) => p.temp > 1)).toBe(true);
      expect(plan.map((p) => p.final)).toEqual([0, 1]);
    });

    it('aguanta orders negativos sin que los temp caigan encima', () => {
      const actuales = items(-3, -2, -1);
      const plan = planDeReorden(actuales, ['id2', 'id1', 'id0']);

      expect(plan.map((p) => p.final)).toEqual([-3, -2, -1]);
      for (const paso of plan) expect(paso.temp).toBeGreaterThan(-1);
    });
  });

  describe('la lista tiene que ser total', () => {
    it('ids repetidos -> 400', () => {
      expect(() => planDeReorden(items(0, 1), ['id0', 'id0'])).toThrow(
        BadRequestException,
      );
    });

    it('un id que no es hermano -> 400, y lo nombra', () => {
      expect(() =>
        planDeReorden(items(0, 1), ['id0', 'id1', 'intruso']),
      ).toThrow(/intruso/);
    });

    it('si falta un hermano -> 400: quedaría con su order viejo en el medio', () => {
      expect(() => planDeReorden(items(0, 1, 2), ['id1', 'id0'])).toThrow(
        /Faltan/,
      );
    });
  });
});

describe('aplicarReorden', () => {
  it('escribe primero TODOS los temporales y después TODOS los finales', async () => {
    const escrituras: [string, number][] = [];
    const actuales = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
    ];

    await aplicarReorden(actuales, ['b', 'a'], (id, order) => {
      escrituras.push([id, order]);
      return Promise.resolve();
    });

    expect(escrituras).toHaveLength(4);
    const [f1, f2, f3, f4] = escrituras;
    // Las dos primeras sacan a los dos del rango final...
    expect(f1[1]).toBeGreaterThan(1);
    expect(f2[1]).toBeGreaterThan(1);
    // ...y recién ahí se asignan los definitivos.
    expect([f3, f4]).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('si la lista es inválida no escribe nada', async () => {
    const mover = jest.fn();
    await expect(
      aplicarReorden([{ id: 'a', order: 0 }], ['a', 'b'], mover),
    ).rejects.toThrow(BadRequestException);
    expect(mover).not.toHaveBeenCalled();
  });
});
