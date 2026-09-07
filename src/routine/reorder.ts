import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Reorden en bloque de los hermanos de un nivel del árbol.
 *
 * Antes mover algo eran N `PATCH /:id { order }` sueltos que el front mandaba
 * en paralelo (`lib/reorder.ts`, `hooks/use-reorder.ts`). Si uno fallaba y los
 * otros entraban, el orden quedaba a medio aplicar y sin forma de repararlo
 * desde la app: por eso esto es una sola llamada dentro de una transacción.
 *
 * `ids` es la lista COMPLETA de hermanos vivos en el orden deseado. Que sea
 * total y no un delta es lo que la hace idempotente y verificable: no hay
 * estado intermedio válido a medio camino.
 */
export interface Ordenable {
  id: string;
  order: number;
}

/** Una escritura del plan: primero `temp`, después `final`. */
interface Paso {
  id: string;
  temp: number;
  final: number;
}

/**
 * Arma el plan en DOS FASES, que es lo que el índice de unicidad obliga.
 *
 * Con `UNIQUE (padre, order)` un intercambio directo se choca a mitad de
 * camino: poner al segundo en la posición 1 falla mientras el primero siga
 * ahí. Así que primero se mueve todo a un rango temporal por encima de todo lo
 * que existe —y por encima de todos los valores finales—, y recién después se
 * bajan a su número definitivo. En ninguno de los dos momentos hay dos
 * hermanos compartiendo `order`.
 *
 * La numeración final arranca en el mínimo que ya había, igual que hace
 * `lib/reorder.ts` en el front: los microciclos empiezan en 1 porque su
 * `order` ES el número de semana, y los días y ejercicios en 0 o en 1 según
 * cómo se hayan creado. Anclarse al mínimo respeta las dos convenciones sin
 * tener que saber cuál es cuál.
 */
export function planDeReorden(actuales: Ordenable[], ids: string[]): Paso[] {
  const repetidos = ids.length !== new Set(ids).size;
  if (repetidos) {
    throw new BadRequestException('La lista de ids trae repetidos');
  }

  const vivos = new Set(actuales.map((a) => a.id));
  const ajenos = ids.filter((id) => !vivos.has(id));
  if (ajenos.length > 0) {
    throw new BadRequestException(
      `Estos ids no son hermanos vivos de este padre: ${ajenos.join(', ')}`,
    );
  }

  // La lista tiene que ser total: si faltara alguno, quedaría con su `order`
  // viejo en el medio de los nuevos y el resultado dependería del azar.
  const faltantes = actuales.filter((a) => !ids.includes(a.id));
  if (faltantes.length > 0) {
    throw new BadRequestException(
      `Faltan hermanos en la lista: ${faltantes.map((f) => f.id).join(', ')}`,
    );
  }

  const base = Math.min(...actuales.map((a) => a.order));
  const finales = ids.map((id, i) => ({ id, final: base + i }));

  // El rango temporal tiene que estar por encima de TODO lo que hay ahora y de
  // todos los finales: si se pisara con alguno, la primera fase chocaría con
  // una fila todavía sin mover, o la segunda con una ya movida.
  const techo = Math.max(
    ...actuales.map((a) => a.order),
    ...finales.map((f) => f.final),
  );
  return finales.map((f, i) => ({ ...f, temp: techo + 1 + i }));
}

/** Aplica el plan sobre un nivel. `mover` es el `update` del modelo. */
export async function aplicarReorden(
  actuales: Ordenable[],
  ids: string[],
  mover: (id: string, order: number) => Promise<unknown>,
): Promise<void> {
  const plan = planDeReorden(actuales, ids);
  for (const p of plan) await mover(p.id, p.temp);
  for (const p of plan) await mover(p.id, p.final);
}

/**
 * Traduce el choque del índice de unicidad en un 409 con un mensaje que diga
 * qué pasó.
 *
 * Sin esto, crear un día con un `order` ya ocupado explotaba como 500: el
 * índice es de la base y Prisma lo devuelve como P2002, que Nest no sabe
 * mapear solo. El front deja editar el campo "Orden" a mano, así que la
 * colisión es un caso de uso real, no un borde teórico.
 */
export async function conOrdenUnico<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const choque =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
    if (!choque) throw e;
    throw new ConflictException(
      'Ya hay otro elemento con ese `order` en el mismo nivel. ' +
        'Usá el endpoint de reorden para mover en bloque.',
    );
  }
}
