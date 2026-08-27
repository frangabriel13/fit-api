import type { INestApplication } from '@nestjs/common';

import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Borra DE VERDAD las rutinas que creó un test.
 *
 * `DELETE /splits/:id` es borrado lógico: protege el historial, pero significa
 * que los tests no limpiarían nada y la base de desarrollo se llenaría de
 * basura corrida tras corrida. Acá se va por debajo de la API a propósito, y
 * la cascada de FKs se lleva microciclos, días, ejercicios, sesiones y series.
 */
export const purgarSplits = async (
  app: INestApplication,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return;
  const prisma = app.get(PrismaService);
  await prisma.split.deleteMany({ where: { id: { in: ids } } });
};
