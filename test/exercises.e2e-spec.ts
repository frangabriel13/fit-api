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
 * Renombrar un ejercicio en toda la rutina.
 *
 * El historial de progreso se agrupa por NOMBRE y un mesociclo repite los
 * mismos ejercicios cada semana, así que corregir un typo en una sola semana
 * parte la serie histórica en dos sin avisar.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};

describe('Renombrar ejercicios (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  const creados: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Rutina de `semanas` semanas, cada una con un día y los mismos ejercicios. */
  const mesociclo = async (semanas: number, ejercicios: string[]) => {
    const split = (
      await request(http)
        .post('/splits')
        .set(auth(trainer))
        .send({ name: `Mesociclo de prueba ${Date.now()}` })
        .expect(201)
    ).body as SplitDto;
    creados.push(split.id);

    const porSemana: DayExerciseDto[][] = [];
    for (let n = 1; n <= semanas; n++) {
      const micro = (
        await request(http)
          .post(`/splits/${split.id}/microcycles`)
          .set(auth(trainer))
          .send({ name: `Semana ${n}`, order: n })
          .expect(201)
      ).body as MicrocycleDto;

      const day = (
        await request(http)
          .post(`/microcycles/${micro.id}/days`)
          .set(auth(trainer))
          .send({ name: 'Día 1', order: 1 })
          .expect(201)
      ).body as DayDto;

      const delDia: DayExerciseDto[] = [];
      for (const [i, name] of ejercicios.entries()) {
        delDia.push(
          (
            await request(http)
              .post(`/days/${day.id}/exercises`)
              .set(auth(trainer))
              .send({ name, order: i + 1, targetSets: 3 })
              .expect(201)
          ).body as DayExerciseDto,
        );
      }
      porSemana.push(delDia);
    }

    return { splitId: split.id, porSemana };
  };

  /** Todos los nombres del árbol, semana por semana. */
  const nombres = async (splitId: string): Promise<string[][]> => {
    const split = (
      await request(http)
        .get(`/splits/${splitId}`)
        .set(auth(trainer))
        .expect(200)
    ).body as SplitDto;

    return split.microcycles.map((m) =>
      m.days.flatMap((d) => d.exercises.map((e) => e.name)),
    );
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    trainer = (
      (await request(http).post('/auth/login').send(TRAINER).expect(200))
        .body as LoginResponseDto
    ).accessToken;
  });

  afterAll(async () => {
    await purgarSplits(app, creados);
    await app.close();
  });

  describe('PATCH /exercises/:id con applyToAll', () => {
    it('renombra las tres semanas de una sola vez', async () => {
      const { splitId, porSemana } = await mesociclo(3, ['Sentadila', 'Remo']);

      await request(http)
        .patch(`/exercises/${porSemana[0][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Sentadilla', applyToAll: true })
        .expect(200);

      expect(await nombres(splitId)).toEqual([
        ['Sentadilla', 'Remo'],
        ['Sentadilla', 'Remo'],
        ['Sentadilla', 'Remo'],
      ]);
    });

    it('no toca a los ejercicios que se llaman distinto', async () => {
      const { splitId, porSemana } = await mesociclo(2, ['Press', 'Remo']);

      await request(http)
        .patch(`/exercises/${porSemana[1][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Press banca', applyToAll: true })
        .expect(200);

      expect(await nombres(splitId)).toEqual([
        ['Press banca', 'Remo'],
        ['Press banca', 'Remo'],
      ]);
    });

    it('no se pasa a OTRA rutina, aunque el nombre coincida', async () => {
      const a = await mesociclo(2, ['Sentadilla']);
      const b = await mesociclo(2, ['Sentadilla']);

      await request(http)
        .patch(`/exercises/${a.porSemana[0][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Sentadilla búlgara', applyToAll: true })
        .expect(200);

      expect(await nombres(a.splitId)).toEqual([
        ['Sentadilla búlgara'],
        ['Sentadilla búlgara'],
      ]);
      // La otra rutina queda intacta: el alcance es el mismo con el que agrupa
      // `GET /splits/:id/progress`.
      expect(await nombres(b.splitId)).toEqual([
        ['Sentadilla'],
        ['Sentadilla'],
      ]);
    });

    it('los demás campos NO se propagan: solo el nombre', async () => {
      const { splitId, porSemana } = await mesociclo(2, ['Curl']);

      await request(http)
        .patch(`/exercises/${porSemana[0][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Curl bíceps', targetSets: 5, applyToAll: true })
        .expect(200);

      const split = (
        await request(http)
          .get(`/splits/${splitId}`)
          .set(auth(trainer))
          .expect(200)
      ).body as SplitDto;
      const sets = split.microcycles.map(
        (m) => m.days[0].exercises[0].targetSets,
      );

      expect(await nombres(splitId)).toEqual([
        ['Curl bíceps'],
        ['Curl bíceps'],
      ]);
      expect(sets).toEqual([5, 3]);
    });
  });

  describe('sin applyToAll sigue siendo el PATCH de siempre', () => {
    it('renombra una sola semana: es un uso legítimo en una progresión', async () => {
      // Semana 3 pasa a sentadilla frontal a propósito. Si el renombre fuera
      // automático, esto sería imposible de expresar.
      const { splitId, porSemana } = await mesociclo(3, ['Sentadilla']);

      await request(http)
        .patch(`/exercises/${porSemana[2][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Sentadilla frontal' })
        .expect(200);

      expect(await nombres(splitId)).toEqual([
        ['Sentadilla'],
        ['Sentadilla'],
        ['Sentadilla frontal'],
      ]);
    });

    it('`applyToAll` sin `name` no hace nada raro', async () => {
      const { splitId, porSemana } = await mesociclo(2, ['Fondos']);

      await request(http)
        .patch(`/exercises/${porSemana[0][0].id}`)
        .set(auth(trainer))
        .send({ targetSets: 4, applyToAll: true })
        .expect(200);

      expect(await nombres(splitId)).toEqual([['Fondos'], ['Fondos']]);
    });

    it('renombrar al mismo nombre que ya tenía es inocuo', async () => {
      const { splitId, porSemana } = await mesociclo(2, ['Plancha']);

      await request(http)
        .patch(`/exercises/${porSemana[0][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Plancha', applyToAll: true })
        .expect(200);

      expect(await nombres(splitId)).toEqual([['Plancha'], ['Plancha']]);
    });

    it('`applyToAll` no booleano -> 400', async () => {
      const { porSemana } = await mesociclo(1, ['Puente']);

      await request(http)
        .patch(`/exercises/${porSemana[0][0].id}`)
        .set(auth(trainer))
        .send({ name: 'Puente de glúteos', applyToAll: 'si' })
        .expect(400);
    });
  });
});
