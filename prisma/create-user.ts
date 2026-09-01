/**
 * Alta de usuarios por línea de comandos.
 *
 * Es el ÚNICO camino para crear un entrenador: la API solo sabe dar de alta
 * clientes (POST /clients), justamente para que nadie pueda fabricarse un
 * entrenador por HTTP. También sirve para crear el primer usuario de una base
 * vacía, cuando todavía no hay nadie con quien loguearse.
 *
 *   npm run user:create -- --email franco@x.com --name "Franco" --role trainer
 *   npm run user:create -- --email ana@x.com --name "Ana" --role client \
 *                          --trainer franco@x.com
 *
 * Sin --password genera una al azar y la imprime una sola vez.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

const MIN_PASSWORD = 8;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** 16 caracteres al azar, sin ambigüedad de mayúsculas al dictarla. */
const generarPassword = (): string => randomBytes(12).toString('base64url');

function leerArgs() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'trainer' },
      password: { type: 'string' },
      trainer: { type: 'string' },
    },
  });

  if (!values.email || !values.name) {
    throw new Error('Faltan --email y/o --name.');
  }
  if (values.role !== 'trainer' && values.role !== 'client') {
    throw new Error(
      `--role tiene que ser trainer o client (vino "${values.role}").`,
    );
  }
  // Un cliente sin entrenador no aparece en ninguna cartera: no lo ve nadie.
  if (values.role === 'client' && !values.trainer) {
    throw new Error(
      'Para --role client hace falta --trainer <email del entrenador>.',
    );
  }
  if (values.password && values.password.length < MIN_PASSWORD) {
    throw new Error(
      `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`,
    );
  }

  return {
    email: normalizeEmail(values.email),
    name: values.name.trim(),
    role: values.role === 'trainer' ? UserRole.trainer : UserRole.client,
    password: values.password,
    trainer: values.trainer ? normalizeEmail(values.trainer) : undefined,
  };
}

async function main(): Promise<void> {
  const args = leerArgs();

  const existe = await prisma.user.findUnique({
    where: { email: args.email },
    select: { id: true },
  });
  if (existe)
    throw new Error(`Ya existe un usuario con el email ${args.email}.`);

  let trainerId: string | undefined;
  if (args.trainer) {
    const entrenador = await prisma.user.findUnique({
      where: { email: args.trainer },
      select: { id: true, role: true },
    });
    if (!entrenador)
      throw new Error(`No existe el entrenador ${args.trainer}.`);
    if (entrenador.role !== UserRole.trainer) {
      throw new Error(`${args.trainer} existe pero no es un entrenador.`);
    }
    trainerId = entrenador.id;
  }

  const password = args.password ?? generarPassword();
  const user = await prisma.user.create({
    data: {
      email: args.email,
      name: args.name,
      password: await argon2.hash(password, { type: argon2.argon2id }),
      role: args.role,
      trainerId,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log(`\nUsuario creado:\n`, user);
  if (!args.password) {
    console.log(`\nContraseña generada: ${password}`);
    console.log('Anotala ahora: no se puede recuperar, solo reemplazar.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
