import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import type { SplitDto } from '../src/routine/routine.types';
import {
  crearClienteDePrueba,
  PREFIJO_CLIENTE,
  purgarSplits,
  purgarUsuariosDePrueba,
} from './helpers';

/**
 * Asignación de rutinas a clientes.
 *
 * La regla de producto es que un cliente tiene UNA rutina activa. El frontend
 * ya la asume: toma la primera de la lista. Antes nada la hacía cumplir, así
 * que asignar una segunda escondía la primera sin ningún aviso ni forma de
 * recuperarla.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};

interface ErrorBody {
  message: string;
}

describe('Asignación de rutinas (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  const creados: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const crearSplit = async (body: object): Promise<SplitDto> => {
    const res = await request(http)
      .post('/splits')
      .set(auth(trainer))
      .send(body);
    const split = res.body as SplitDto;
    if (split.id) creados.push(split.id);
    return split;
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    await purgarUsuariosDePrueba(app, PREFIJO_CLIENTE);

    trainer = (
      (await request(http).post('/auth/login').send(TRAINER))
        .body as LoginResponseDto
    ).accessToken;
  });

  afterAll(async () => {
    await purgarSplits(app, creados);
    await purgarUsuariosDePrueba(app, PREFIJO_CLIENTE);
    await app.close();
  });

  describe('SplitDto dice a quién está asignada', () => {
    it('sin asignar, `clients` es un array vacío', async () => {
      const split = await crearSplit({ name: 'Sin dueño' });
      expect(split.clients).toEqual([]);
    });

    it('asignada, trae id y nombre del cliente', async () => {
      const cliente = await crearClienteDePrueba(http, trainer, 'Ana Asignada');
      const split = await crearSplit({
        name: 'Con dueño',
        clientId: cliente.id,
      });

      expect(split.clients).toEqual([{ id: cliente.id, name: 'Ana Asignada' }]);
    });

    it('también viene en el detalle y en el listado', async () => {
      const cliente = await crearClienteDePrueba(http, trainer, 'Beto Detalle');
      const split = await crearSplit({ name: 'Detalle', clientId: cliente.id });

      const detalle = (
        await request(http)
          .get(`/splits/${split.id}`)
          .set(auth(trainer))
          .expect(200)
      ).body as SplitDto;
      expect(detalle.clients).toEqual([
        { id: cliente.id, name: 'Beto Detalle' },
      ]);

      const listado = (
        await request(http)
          .get(`/splits?clientId=${cliente.id}`)
          .set(auth(trainer))
          .expect(200)
      ).body as SplitDto[];
      expect(listado[0].clients.map((c) => c.id)).toEqual([cliente.id]);
    });
  });

  describe('un cliente, una rutina', () => {
    it('asignarle una segunda -> 409, y la primera sigue visible', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const primera = await crearSplit({
        name: 'Primera',
        clientId: cliente.id,
      });

      const res = await request(http)
        .post('/splits')
        .set(auth(trainer))
        .send({ name: 'Segunda', clientId: cliente.id })
        .expect(409);

      expect((res.body as ErrorBody).message).toContain('Primera');

      const suyas = (
        await request(http).get('/splits').set(auth(cliente.token)).expect(200)
      ).body as SplitDto[];
      expect(suyas.map((s) => s.id)).toEqual([primera.id]);
    });

    it('el PATCH tampoco puede asignarle una segunda', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      await crearSplit({ name: 'La que ya tiene', clientId: cliente.id });
      const otra = await crearSplit({ name: 'La otra' });

      await request(http)
        .patch(`/splits/${otra.id}`)
        .set(auth(trainer))
        .send({ clientId: cliente.id })
        .expect(409);
    });

    it('reasignar la MISMA rutina al mismo cliente no es conflicto', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const split = await crearSplit({
        name: 'La misma',
        clientId: cliente.id,
      });

      await request(http)
        .patch(`/splits/${split.id}`)
        .set(auth(trainer))
        .send({ clientId: cliente.id, name: 'La misma, renombrada' })
        .expect(200);
    });

    it('una rutina borrada no bloquea una nueva asignación', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const vieja = await crearSplit({ name: 'Vieja', clientId: cliente.id });

      await request(http)
        .delete(`/splits/${vieja.id}`)
        .set(auth(trainer))
        .expect(204);

      const nueva = await crearSplit({ name: 'Nueva', clientId: cliente.id });
      expect(nueva.clients.map((c) => c.id)).toEqual([cliente.id]);
    });

    it('la misma rutina sí se le puede asignar a varios clientes', async () => {
      const uno = await crearClienteDePrueba(http, trainer, 'Uno');
      const dos = await crearClienteDePrueba(http, trainer, 'Dos');
      const split = await crearSplit({ name: 'Compartida', clientId: uno.id });

      const res = await request(http)
        .patch(`/splits/${split.id}`)
        .set(auth(trainer))
        .send({ clientId: dos.id })
        .expect(200);

      expect((res.body as SplitDto).clients.map((c) => c.id).sort()).toEqual(
        [uno.id, dos.id].sort(),
      );
    });
  });

  describe('DELETE /splits/:splitId/assignments/:clientId', () => {
    it('desasigna y libera al cliente para una rutina nueva', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const vieja = await crearSplit({
        name: 'A desasignar',
        clientId: cliente.id,
      });

      await request(http)
        .delete(`/splits/${vieja.id}/assignments/${cliente.id}`)
        .set(auth(trainer))
        .expect(204);

      // Ya no la ve, pero la rutina sigue existiendo para el entrenador.
      const suyas = (
        await request(http).get('/splits').set(auth(cliente.token)).expect(200)
      ).body as SplitDto[];
      expect(suyas).toEqual([]);

      const nueva = await crearSplit({
        name: 'La nueva',
        clientId: cliente.id,
      });
      expect(nueva.clients.map((c) => c.id)).toEqual([cliente.id]);
    });

    it('desasignar lo que no estaba asignado -> 404', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const split = await crearSplit({ name: 'Sin asignar' });

      await request(http)
        .delete(`/splits/${split.id}/assignments/${cliente.id}`)
        .set(auth(trainer))
        .expect(404);
    });

    it('un cliente no puede desasignarse solo -> 403, nunca 401', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const split = await crearSplit({
        name: 'No la toques',
        clientId: cliente.id,
      });

      await request(http)
        .delete(`/splits/${split.id}/assignments/${cliente.id}`)
        .set(auth(cliente.token))
        .expect(403);
    });

    it('sin token -> 401', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const split = await crearSplit({
        name: 'Sin token',
        clientId: cliente.id,
      });

      await request(http)
        .delete(`/splits/${split.id}/assignments/${cliente.id}`)
        .expect(401);
    });
  });

  describe('el filtro por usuario acepta userId y clientId en todos lados', () => {
    it('`GET /splits` responde igual con los dos nombres', async () => {
      const cliente = await crearClienteDePrueba(http, trainer);
      const split = await crearSplit({
        name: 'Filtrable',
        clientId: cliente.id,
      });

      const porClientId = await request(http)
        .get(`/splits?clientId=${cliente.id}`)
        .set(auth(trainer))
        .expect(200);
      const porUserId = await request(http)
        .get(`/splits?userId=${cliente.id}`)
        .set(auth(trainer))
        .expect(200);

      expect((porClientId.body as SplitDto[]).map((s) => s.id)).toEqual([
        split.id,
      ]);
      expect(porUserId.body).toEqual(porClientId.body);
    });

    it('un uuid inválido en el alias también se rechaza con 400', () =>
      request(http)
        .get('/splits?clientId=no-es-uuid')
        .set(auth(trainer))
        .expect(400));
  });
});
