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

/**
 * Borra los usuarios de prueba que crea el suite de alta.
 *
 * No hay endpoint para dar de baja un usuario (borrarlo de verdad se llevaría
 * puesto su historial por la cascada de FKs), así que los tests limpian por
 * debajo de la API. Los usuarios que crea el suite no tienen historial.
 */
export const purgarUsuariosDePrueba = async (
  app: INestApplication,
  prefijoEmail: string,
): Promise<void> => {
  const prisma = app.get(PrismaService);
  await prisma.user.deleteMany({
    where: { email: { startsWith: prefijoEmail } },
  });
};
