import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import type {
  DayDto,
  DayExerciseDto,
  MicrocycleDto,
  SplitDto,
} from '../src/routine/routine.types';
import { purgarSplits } from './helpers';

/**
 * Reorden en bloque y unicidad de `order`.
 *
 * Antes mover algo eran N PATCH sueltos sin transacción: si uno fallaba, el
 * orden quedaba a medio aplicar. Y nada impedía que dos hermanos compartieran
 * número, con lo cual un intercambio podía no mover nada.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};
const AJENO = { email: 'user1@fitback.dev', password: 'fitdev1234' };

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Reorden y unicidad de order (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  let ajeno: string;
  let splitId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Microciclo nuevo con `n` días, cada uno con `m` ejercicios. */
  const escenario = async (n = 3, m = 3) => {
    const micro = (
      await request(http)
        .post(`/splits/${splitId}/microcycles`)
        .set(auth(trainer))
        .send({ name: `Semana ${Date.now()}`, order: siguienteSemana++ })
        .expect(201)
    ).body as MicrocycleDto;

    const days: DayDto[] = [];
    for (let i = 0; i < n; i++) {
      days.push(
        (
          await request(http)
            .post(`/microcycles/${micro.id}/days`)
            .set(auth(trainer))
            .send({ name: `Día ${i + 1}`, order: i })
            .expect(201)
        ).body as DayDto,
      );
    }

    const exercises: DayExerciseDto[] = [];
    for (let i = 0; i < m; i++) {
      exercises.push(
        (
          await request(http)
            .post(`/days/${days[0].id}/exercises`)
            .set(auth(trainer))
            .send({ name: `Ejercicio ${i + 1}`, order: i, targetSets: 3 })
            .expect(201)
        ).body as DayExerciseDto,
      );
    }

    return { micro, days, exercises };
  };

  let siguienteSemana = 1;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    const login = async (body: typeof TRAINER) =>
      (
        (await request(http).post('/auth/login').send(body))
          .body as LoginResponseDto
      ).accessToken;

    trainer = await login(TRAINER);
    ajeno = await login(AJENO);

    splitId = (
      (
        await request(http)
          .post('/splits')
          .set(auth(trainer))
          .send({ name: 'Split de reorden (test)' })
          .expect(201)
      ).body as SplitDto
    ).id;
  });

  afterAll(async () => {
    await purgarSplits(app, [splitId]);
    await app.close();
  });

  describe('PUT /days/:dayId/exercises/order', () => {
    it('reordena en una sola llamada y devuelve la lista ya ordenada', async () => {
      const { days, exercises } = await escenario();
      const [a, b, c] = exercises;

      const res = await request(http)
        .put(`/days/${days[0].id}/exercises/order`)
        .set(auth(trainer))
        .send({ ids: [c.id, a.id, b.id] })
        .expect(200);

      const vuelta = res.body as DayExerciseDto[];
      expect(vuelta.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
      // Renumerado desde el mínimo que ya había (acá 0), sin huecos.
      expect(vuelta.map((e) => e.order)).toEqual([0, 1, 2]);
    });

    it('el intercambio de dos vecinos no choca con el índice de unicidad', async () => {
      const { days, exercises } = await escenario(1, 2);
      const [a, b] = exercises;

      const vuelta = (
        await request(http)
          .put(`/days/${days[0].id}/exercises/order`)
          .set(auth(trainer))
          .send({ ids: [b.id, a.id] })
          .expect(200)
      ).body as DayExerciseDto[];

      expect(vuelta.map((e) => e.id)).toEqual([b.id, a.id]);
      expect(vuelta.map((e) => e.order)).toEqual([0, 1]);
    });

    it('es idempotente: mandar el mismo orden dos veces da lo mismo', async () => {
      const { days, exercises } = await escenario(1, 3);
      const ids = [exercises[2].id, exercises[0].id, exercises[1].id];
      const pedir = async () =>
        (
          await request(http)
            .put(`/days/${days[0].id}/exercises/order`)
            .set(auth(trainer))
            .send({ ids })
            .expect(200)
        ).body as DayExerciseDto[];

      expect(await pedir()).toEqual(await pedir());
    });

    it('la lista tiene que ser total: si falta un hermano -> 400', async () => {
      const { days, exercises } = await escenario(1, 3);

      const res = await request(http)
        .put(`/days/${days[0].id}/exercises/order`)
        .set(auth(trainer))
        .send({ ids: [exercises[1].id, exercises[0].id] })
        .expect(400);
      expect((res.body as { message: string }).message).toContain('Faltan');
    });

    it('un id de otro padre -> 400, y no mueve nada', async () => {
      const { days, exercises } = await escenario(2, 2);
      const ajenoAlDia = (
        await request(http)
          .post(`/days/${days[1].id}/exercises`)
          .set(auth(trainer))
          .send({ name: 'De otro día', order: 0, targetSets: 3 })
          .expect(201)
      ).body as DayExerciseDto;

      await request(http)
        .put(`/days/${days[0].id}/exercises/order`)
        .set(auth(trainer))
        .send({ ids: [exercises[1].id, exercises[0].id, ajenoAlDia.id] })
        .expect(400);

      // El orden original quedó intacto: la transacción no se aplicó a medias.
      const intacto = (
        await request(http)
          .get(`/splits/${splitId}`)
          .set(auth(trainer))
          .expect(200)
      ).body as SplitDto;
      const dia = intacto.microcycles
        .flatMap((m) => m.days)
        .find((d) => d.id === days[0].id);
      expect(dia?.exercises.map((e) => e.id)).toEqual([
        exercises[0].id,
        exercises[1].id,
      ]);
    });

    it('ids repetidos -> 400', async () => {
      const { days, exercises } = await escenario(1, 2);

      await request(http)
        .put(`/days/${days[0].id}/exercises/order`)
        .set(auth(trainer))
        .send({ ids: [exercises[0].id, exercises[0].id] })
        .expect(400);
    });

    it('ids vacío o mal formado -> 400', async () => {
      const { days } = await escenario(1, 1);
      const mandar = (body: object) =>
        request(http)
          .put(`/days/${days[0].id}/exercises/order`)
          .set(auth(trainer))
          .send(body)
          .expect(400);

      await mandar({ ids: [] });
      await mandar({ ids: ['no-es-uuid'] });
      await mandar({});
    });

    it('día ajeno -> 403; inexistente -> 404; sin token -> 401', async () => {
      const { days, exercises } = await escenario(1, 1);
      const body = { ids: [exercises[0].id] };

      await request(http)
        .put(`/days/${days[0].id}/exercises/order`)
        .set(auth(ajeno))
        .send(body)
        .expect(403);
      await request(http)
        .put(`/days/${UUID_INEXISTENTE}/exercises/order`)
        .set(auth(trainer))
        .send(body)
        .expect(404);
      await request(http)
        .put(`/days/${days[0].id}/exercises/order`)
        .send(body)
        .expect(401);
    });
  });

  describe('PUT /microcycles/:microcycleId/days/order y /splits/:splitId/microcycles/order', () => {
    it('reordena los días de un microciclo', async () => {
      const { micro, days } = await escenario(3, 0);

      const vuelta = (
        await request(http)
          .put(`/microcycles/${micro.id}/days/order`)
          .set(auth(trainer))
          .send({ ids: [days[2].id, days[1].id, days[0].id] })
          .expect(200)
      ).body as DayDto[];

      expect(vuelta.map((d) => d.id)).toEqual([
        days[2].id,
        days[1].id,
        days[0].id,
      ]);
      expect(vuelta.map((d) => d.order)).toEqual([0, 1, 2]);
    });

    it('las semanas se renumeran desde el mínimo, que es el número de semana', async () => {
      const propio = (
        (
          await request(http)
            .post('/splits')
            .set(auth(trainer))
            .send({ name: 'Split de semanas (test)' })
            .expect(201)
        ).body as SplitDto
      ).id;

      const semanas: MicrocycleDto[] = [];
      for (const n of [1, 2, 3]) {
        semanas.push(
          (
            await request(http)
              .post(`/splits/${propio}/microcycles`)
              .set(auth(trainer))
              .send({ name: `Semana ${n}`, order: n })
              .expect(201)
          ).body as MicrocycleDto,
        );
      }

      const vuelta = (
        await request(http)
          .put(`/splits/${propio}/microcycles/order`)
          .set(auth(trainer))
          .send({ ids: [semanas[2].id, semanas[0].id, semanas[1].id] })
          .expect(200)
      ).body as MicrocycleDto[];

      // Arranca en 1, no en 0: el `order` de un microciclo ES la semana.
      expect(vuelta.map((m) => m.order)).toEqual([1, 2, 3]);
      expect(vuelta.map((m) => m.name)).toEqual([
        'Semana 3',
        'Semana 1',
        'Semana 2',
      ]);

      await purgarSplits(app, [propio]);
    });
  });

  describe('unicidad de `order` entre hermanos vivos', () => {
    it('crear un ejercicio con un order ya ocupado -> 409', async () => {
      const { days } = await escenario(1, 2);

      const res = await request(http)
        .post(`/days/${days[0].id}/exercises`)
        .set(auth(trainer))
        .send({ name: 'Choca', order: 0, targetSets: 3 })
        .expect(409);
      expect((res.body as { message: string }).message).toContain('order');
    });

    it('mover uno a mano con PATCH sobre un order ocupado -> 409', async () => {
      const { exercises } = await escenario(1, 2);

      await request(http)
        .patch(`/exercises/${exercises[1].id}`)
        .set(auth(trainer))
        .send({ order: exercises[0].order })
        .expect(409);
    });

    it('un día con un order ya ocupado -> 409', async () => {
      const { micro } = await escenario(2, 0);

      await request(http)
        .post(`/microcycles/${micro.id}/days`)
        .set(auth(trainer))
        .send({ name: 'Choca', order: 0 })
        .expect(409);
    });

    it('lo borrado NO ocupa lugar: se puede reusar el order de un borrado', async () => {
      const { days, exercises } = await escenario(1, 2);

      await request(http)
        .delete(`/exercises/${exercises[1].id}`)
        .set(auth(trainer))
        .expect(204);

      // Si el índice no fuera parcial, este 201 sería un 409 y el order del
      // borrado quedaría reservado para siempre.
      await request(http)
        .post(`/days/${days[0].id}/exercises`)
        .set(auth(trainer))
        .send({
          name: 'Reusa el hueco',
          order: exercises[1].order,
          targetSets: 3,
        })
        .expect(201);
    });
  });
});
