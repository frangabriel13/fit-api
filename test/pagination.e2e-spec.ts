import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import type { SplitDto } from '../src/routine/routine.types';
import { purgarSplits } from './helpers';

/**
 * Paginación de los listados.
 *
 * Es opcional a propósito: sin parámetros la respuesta es idéntica a antes.
 * Las respuestas son arrays pelados, así que no se puede envolver en
 * `{ items, total }`, y un límite por default recortaría datos en silencio a
 * un cliente que no lo pidió.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};

describe('Paginación (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  const creados: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    trainer = (
      (await request(http).post('/auth/login').send(TRAINER))
        .body as LoginResponseDto
    ).accessToken;

    // Cinco rutinas para tener algo que paginar.
    for (let i = 1; i <= 5; i += 1) {
      const split = (
        await request(http)
          .post('/splits')
          .set(auth(trainer))
          .send({ name: `Rutina paginada ${i}` })
      ).body as SplitDto;
      creados.push(split.id);
    }
  });

  afterAll(async () => {
    await purgarSplits(app, creados);
    await app.close();
  });

  const splits = async (query = '') =>
    (await request(http).get(`/splits${query}`).set(auth(trainer)).expect(200))
      .body as SplitDto[];

  it('sin parámetros devuelve todo, como antes', async () => {
    const todos = await splits();
    expect(todos.length).toBeGreaterThanOrEqual(5);
  });

  it('`limit` recorta y sigue siendo un array pelado', async () => {
    const res = await request(http)
      .get('/splits?limit=2')
      .set(auth(trainer))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).not.toHaveProperty('data');
    expect(res.body).not.toHaveProperty('items');
    expect(res.body as SplitDto[]).toHaveLength(2);
  });

  it('`offset` corre la ventana sin repetir ni saltear', async () => {
    const todos = await splits();
    const primeros = await splits('?limit=2');
    const siguientes = await splits('?limit=2&offset=2');

    expect(primeros.map((s) => s.id)).toEqual(
      todos.slice(0, 2).map((s) => s.id),
    );
    expect(siguientes.map((s) => s.id)).toEqual(
      todos.slice(2, 4).map((s) => s.id),
    );
  });

  it('recorrer todas las páginas junta el listado completo', async () => {
    const todos = await splits();
    const juntadas: string[] = [];

    for (let offset = 0; offset < todos.length; offset += 2) {
      const pagina = await splits(`?limit=2&offset=${offset}`);
      juntadas.push(...pagina.map((s) => s.id));
    }

    expect(juntadas).toEqual(todos.map((s) => s.id));
  });

  it('un offset más allá del final devuelve array vacío, no error', async () => {
    expect(await splits('?offset=9999')).toEqual([]);
  });

  it('valores inválidos -> 400', async () => {
    for (const q of [
      '?limit=0',
      '?limit=201',
      '?limit=abc',
      '?limit=1.5',
      '?offset=-1',
    ]) {
      await request(http).get(`/splits${q}`).set(auth(trainer)).expect(400);
    }
  });

  it('también pagina /clients', async () => {
    const res = await request(http)
      .get('/clients?limit=1')
      .set(auth(trainer))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as UserDto[]).length).toBeLessThanOrEqual(1);
  });

  it('la paginación convive con el filtro por cliente', async () => {
    const clientes = (await request(http).get('/clients').set(auth(trainer)))
      .body as UserDto[];

    const res = await request(http)
      .get(`/splits?clientId=${clientes[0].id}&limit=1`)
      .set(auth(trainer))
      .expect(200);

    expect((res.body as SplitDto[]).length).toBeLessThanOrEqual(1);
  });
});
