/**
 * Seed de DESARROLLO.
 *
 * Las contraseñas originales de la base heredada de `fitback` se perdieron
 * (están hasheadas con argon2id y no se pueden recuperar). Este script les
 * pone un valor conocido para poder probar el login.
 *
 * Solo toca el campo `password` de los usuarios que ya existen: no crea, no
 * borra, y no modifica rutinas ni sesiones.
 *
 * Estas credenciales son de desarrollo y no deben migrar a producción.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'fitdev1234';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  });

  if (users.length === 0) {
    console.log('No hay usuarios en la base. Nada que hacer.');
    return;
  }

  const password = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { password },
    });
    console.log(`  ${user.email.padEnd(30)} ${user.role}`);
  }

  console.log(`\n${users.length} contraseñas reseteadas a: ${DEV_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed falló:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
