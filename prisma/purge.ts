/**
 * Purga de DESARROLLO: borra de verdad las rutinas marcadas como borradas.
 *
 * El soft delete protege el historial en el uso normal, pero eso significa que
 * nada se elimina nunca — y las corridas de tests dejan basura acumulada. Esto
 * la limpia.
 *
 * OJO: borrar de verdad un split SÍ se lleva puesto su historial por la
 * cascada de FKs. Por eso es una herramienta de desarrollo y no un endpoint.
 * Nunca correr contra datos que importen sin saber lo que se está tirando.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const muertos = await prisma.split.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, name: true },
  });

  if (muertos.length === 0) {
    console.log('No hay rutinas borradas para purgar.');
    return;
  }

  const ids = muertos.map((s) => s.id);
  const sesiones = await prisma.workoutSession.count({
    where: { day: { microcycle: { splitId: { in: ids } } } },
  });

  console.log(
    `Purgando ${muertos.length} rutinas borradas (arrastran ${sesiones} sesiones).`,
  );

  // La cascada de la base se lleva microciclos, días, ejercicios, sesiones y
  // set-logs.
  const { count } = await prisma.split.deleteMany({ where: { id: { in: ids } } });

  const quedan = {
    splits: await prisma.split.count(),
    sesiones: await prisma.workoutSession.count(),
    setLogs: await prisma.setLog.count(),
  };
  console.log(`Purgadas: ${count}. Quedan:`, quedan);
}

main()
  .catch((error: unknown) => {
    console.error('Purga falló:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
