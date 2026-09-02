import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
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

/** Prefijo de los clientes descartables. `purgarUsuariosDePrueba` los busca así. */
export const PREFIJO_CLIENTE = 'e2e-cliente-';

const PASSWORD_DE_PRUEBA = 'clientedeprueba1234';
let contador = 0;

export interface ClienteDePrueba {
  id: string;
  email: string;
  token: string;
}

/**
 * Crea un cliente descartable en la cartera del entrenador y lo deja logueado.
 *
 * Los suites que asignan una rutina necesitan un cliente SIN rutina: desde que
 * un cliente solo puede tener una activa, reusar al del seed —que ya tiene la
 * suya— hace fallar la asignación con 409. Además deja cada suite
 * independiente del estado de asignaciones que haya en la base.
 */
export const crearClienteDePrueba = async (
  http: App,
  trainerToken: string,
  nombre = 'Cliente descartable',
): Promise<ClienteDePrueba> => {
  const email = `${PREFIJO_CLIENTE}${Date.now()}-${contador++}@fitfront.test`;
  const auth = { Authorization: `Bearer ${trainerToken}` };

  const alta = await request(http)
    .post('/clients')
    .set(auth)
    .send({ email, name: nombre, password: PASSWORD_DE_PRUEBA })
    .expect(201);

  const login = await request(http)
    .post('/auth/login')
    .send({ email, password: PASSWORD_DE_PRUEBA })
    .expect(200);

  return {
    id: (alta.body as UserDto).id,
    email,
    token: (login.body as LoginResponseDto).accessToken,
  };
};
