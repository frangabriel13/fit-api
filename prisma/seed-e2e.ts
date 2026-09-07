/**
 * Fixtures mínimos para correr los tests e2e sobre una base VACÍA.
 *
 * `seed.ts` no sirve para esto: solo resetea contraseñas de usuarios que ya
 * existen, porque en desarrollo la base viene heredada del backend anterior. En
 * CI no hay nada, así que hace falta crear a mano las tres cuentas que los
 * suites dan por sentadas.
 *
 * Es idempotente (upsert): se puede correr sobre una base ya sembrada.
 *
 * Credenciales de desarrollo y de CI. NO deben migrar a producción.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const PASSWORD = process.env.SEED_PASSWORD ?? 'fitdev1234';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** El entrenador es el dueño de la cartera; los otros dos cuelgan de eso. */
const FIXTURES = [
  {
    email: 'mansilla.franco.1@gmail.com',
    name: 'Franco',
    role: UserRole.trainer,
    deTrainer: false,
  },
  // Cliente DE ese entrenador: los tests miran su historial y su rutina.
  {
    email: 'diamela@fitness.com',
    name: 'Diamela',
    role: UserRole.client,
    deTrainer: true,
  },
  // Cliente AJENO, sin entrenador: es el que tiene que comerse los 403.
  {
    email: 'user1@fitback.dev',
    name: 'Usuario Ajeno',
    role: UserRole.client,
    deTrainer: false,
  },
];

/**
 * Rutina mínima que los suites dan por sentada: varios tests leen "la rutina
 * que el cliente ya tiene" en vez de crearse una, así que sin esto fallan en
 * una base vacía aunque los usuarios existan.
 */
async function sembrarRutina(
  trainerId: string,
  clientId: string,
): Promise<void> {
  const yaTiene = await prisma.splitAssignment.findFirst({
    where: { clientId, isActive: true, split: { deletedAt: null } },
    select: { id: true },
  });
  if (yaTiene) {
    console.log('  (el cliente ya tiene una rutina asignada: no se toca)');
    return;
  }

  await prisma.split.create({
    data: {
      name: 'Hipertrofia · Mesociclo Inferior',
      description: 'Rutina de ejemplo para desarrollo y CI.',
      ownerId: trainerId,
      assignments: { create: { clientId, trainerId } },
      microcycles: {
        create: {
          // El `order` de un microciclo ES el número de semana: arranca en 1.
          name: 'Semana 1',
          order: 1,
          days: {
            create: {
              name: 'Día 1 · Inferior',
              order: 1,
              exercises: {
                create: [
                  { name: 'Sentadilla con barra', order: 1, targetSets: 4 },
                  { name: 'Prensa 45°', order: 2, targetSets: 3 },
                ],
              },
            },
          },
        },
      },
    },
  });
  console.log('  rutina de ejemplo creada y asignada');
}

async function main(): Promise<void> {
  const password = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  let trainerId: string | null = null;
  let clientId: string | null = null;

  for (const f of FIXTURES) {
    // El `update` NO toca el `name`: si la base ya existe —desarrollo—, correr
    // esto no tiene por qué renombrarle las cuentas a nadie. Sí fuerza lo que
    // los tests necesitan para pasar: contraseña conocida, rol, cartera y que
    // la cuenta no esté dada de baja.
    const necesario = {
      role: f.role,
      password,
      deletedAt: null,
      trainerId: f.deTrainer ? trainerId : null,
    };
    const user = await prisma.user.upsert({
      where: { email: f.email },
      create: { email: f.email, name: f.name, ...necesario },
      update: necesario,
      select: { id: true, email: true, role: true },
    });
    if (f.role === UserRole.trainer) trainerId = user.id;
    if (f.deTrainer) clientId = user.id;
    console.log(`  ${user.email.padEnd(30)} ${user.role}`);
  }

  if (trainerId && clientId) await sembrarRutina(trainerId, clientId);

  console.log(`\n${FIXTURES.length} usuarios listos. Contraseña: ${PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed e2e falló:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
