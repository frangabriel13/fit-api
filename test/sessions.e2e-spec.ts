import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import type {
  DayDto,
  DayExerciseDto,
  MicrocycleDto,
  SplitDto,
} from '../src/routine/routine.types';
import type {
  SetLogDto,
  WorkoutSessionDto,
} from '../src/sessions/sessions.types';

/**
 * Sesiones de entrenamiento y el upsert en lote de series.
 *
 * Los tests arman su propio split y al final lo borran: la cascada se lleva
 * sesiones y set-logs, así que no dejan basura en la base de desarrollo.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};
const CLIENT = { email: 'diamela@fitness.com', password: 'fitdev1234' };
const AJENO = { email: 'user1@fitback.dev', password: 'fitdev1234' };

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Sesiones y set-logs (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  let client: string;
  let ajeno: string;
  let clientId: string;

  let splitId: string;
  let dayId: string;
  let otroDayId: string;
  let ex1: string;
  let ex2: string;
  let ejercicioDeOtroDia: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** El estado completo de la grilla, como lo manda el front en cada PUT. */
  const grilla = (reps: number) => [
    ...[1, 2, 3].map((n) => ({
      dayExerciseId: ex1,
      setNumber: n,
      actualReps: reps,
      actualRir: 1,
      weight: 60 + n,
      completed: true,
    })),
    ...[1, 2].map((n) => ({
      dayExerciseId: ex2,
      setNumber: n,
      actualReps: reps,
      actualRir: 2,
      weight: 100 + n,
      completed: true,
    })),
  ];

  const nuevaSesion = async (): Promise<WorkoutSessionDto> =>
    (
      await request(http)
        .post(`/days/${dayId}/sessions`)
        .set(auth(client))
        .send({})
        .expect(201)
    ).body as WorkoutSessionDto;

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
    client = await login(CLIENT);
    ajeno = await login(AJENO);

    clientId = (
      (await request(http).get('/clients').set(auth(trainer))).body as UserDto[]
    )[0].id;

    // Split propio para estos tests, asignado al cliente.
    splitId = (
      (
        await request(http)
          .post('/splits')
          .set(auth(trainer))
          .send({ name: 'Split de sesiones (test)', clientId })
      ).body as SplitDto
    ).id;

    const micro = (
      await request(http)
        .post(`/splits/${splitId}/microcycles`)
        .set(auth(trainer))
        .send({ name: 'Semana 1', order: 1 })
    ).body as MicrocycleDto;

    const crearDia = async (name: string, order: number) =>
      (
        await request(http)
          .post(`/microcycles/${micro.id}/days`)
          .set(auth(trainer))
          .send({ name, order })
      ).body as DayDto;

    const crearEjercicio = async (dId: string, name: string, order: number) =>
      (
        await request(http)
          .post(`/days/${dId}/exercises`)
          .set(auth(trainer))
          .send({ name, order, targetSets: 3 })
      ).body as DayExerciseDto;

    dayId = (await crearDia('Día 1', 1)).id;
    otroDayId = (await crearDia('Día 2', 2)).id;

    ex1 = (await crearEjercicio(dayId, 'Sentadilla', 1)).id;
    ex2 = (await crearEjercicio(dayId, 'Peso muerto', 2)).id;
    ejercicioDeOtroDia = (await crearEjercicio(otroDayId, 'Press', 1)).id;
  });

  afterAll(async () => {
    // La cascada se lleva días, ejercicios, sesiones y set-logs.
    await request(http).delete(`/splits/${splitId}`).set(auth(trainer));
    await app.close();
  });

  describe('POST /days/:dayId/sessions', () => {
    it('acepta body vacío y devuelve la sesión completa', async () => {
      const session = await nuevaSesion();

      expect(Object.keys(session).sort()).toEqual([
        'dayId',
        'id',
        'notes',
        'performedAt',
        'setLogs',
      ]);
      expect(session.dayId).toBe(dayId);
      expect(session.setLogs).toEqual([]);
    });

    it('`performedAt` es ISO 8601 con zona', async () => {
      const session = await nuevaSesion();

      expect(session.performedAt).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
      expect(Number.isNaN(Date.parse(session.performedAt))).toBe(false);
    });

    it('llamarlo dos veces el mismo día no duplica la sesión', async () => {
      const primera = await nuevaSesion();
      const segunda = await nuevaSesion();

      expect(segunda.id).toBe(primera.id);
    });

    it('sin permiso sobre la rutina -> 403', () =>
      request(http)
        .post(`/days/${dayId}/sessions`)
        .set(auth(ajeno))
        .send({})
        .expect(403));
  });

  describe('PUT /sessions/:id/set-logs — el upsert en lote', () => {
    it('crea las series y devuelve la sesión completa', async () => {
      const { id } = await nuevaSesion();

      const res = await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10) })
        .expect(200);
      const session = res.body as WorkoutSessionDto;

      expect(session.id).toBe(id);
      expect(session.setLogs).toHaveLength(5);
    });

    it('la clave natural es (sesión, ejercicio, serie): actualiza, no duplica', async () => {
      const { id } = await nuevaSesion();
      await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10) });

      const res = await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            {
              dayExerciseId: ex1,
              setNumber: 1,
              actualReps: 12,
              actualRir: 0,
              weight: 99,
              completed: true,
            },
          ],
        })
        .expect(200);
      const session = res.body as WorkoutSessionDto;

      expect(session.setLogs).toHaveLength(5);
      const serie = session.setLogs.find(
        (l) => l.dayExerciseId === ex1 && l.setNumber === 1,
      );
      expect(serie?.actualReps).toBe(12);
      expect(serie?.weight).toBe(99);
    });

    it('NO es reemplazo total: lo que no viene en el body queda intacto', async () => {
      const { id } = await nuevaSesion();
      await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10) });

      const res = await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            {
              dayExerciseId: ex1,
              setNumber: 1,
              actualReps: 5,
              completed: true,
            },
          ],
        });
      const session = res.body as WorkoutSessionDto;

      expect(session.setLogs).toHaveLength(5);
      const intacta = session.setLogs.find(
        (l) => l.dayExerciseId === ex2 && l.setNumber === 1,
      );
      expect(intacta?.actualReps).toBe(10);
      expect(intacta?.weight).toBe(101);
    });

    it('campo numérico ausente se guarda NULL, no 0', async () => {
      const { id } = await nuevaSesion();
      await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10) });

      const res = await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [{ dayExerciseId: ex1, setNumber: 1, completed: false }],
        });
      const session = res.body as WorkoutSessionDto;

      const serie = session.setLogs.find(
        (l) => l.dayExerciseId === ex1 && l.setNumber === 1,
      );
      expect(serie?.actualReps).toBeNull();
      expect(serie?.actualRir).toBeNull();
      expect(serie?.weight).toBeNull();
      expect(serie?.actualReps).not.toBe(0);
    });

    it('es idempotente: el mismo payload dos veces da el mismo estado', async () => {
      const { id } = await nuevaSesion();
      const enviar = () =>
        request(http)
          .put(`/sessions/${id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(8) });

      const primera = ((await enviar()).body as WorkoutSessionDto).setLogs;
      const segunda = ((await enviar()).body as WorkoutSessionDto).setLogs;

      const normalizar = (logs: SetLogDto[]) =>
        JSON.stringify(
          logs
            .map((l) => [l.dayExerciseId, l.setNumber, l.actualReps, l.weight])
            .sort(),
        );
      expect(normalizar(segunda)).toBe(normalizar(primera));
    });

    it('aguanta llamadas encimadas sin duplicar ni fallar', async () => {
      const { id } = await nuevaSesion();

      // El front lo dispara con debounce de 800ms y al toque al completar una
      // serie: los requests se pisan.
      const respuestas = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          request(http)
            .put(`/sessions/${id}/set-logs`)
            .set(auth(client))
            .send({ setLogs: grilla(10 + i) }),
        ),
      );

      respuestas.forEach((r) => expect(r.status).toBe(200));

      const final = (
        await request(http).get(`/sessions/${id}`).set(auth(client))
      ).body as WorkoutSessionDto;

      expect(final.setLogs).toHaveLength(5);
      const claves = final.setLogs.map(
        (l) => `${l.dayExerciseId}:${l.setNumber}`,
      );
      expect(new Set(claves).size).toBe(claves.length);
    });

    it('un ejercicio de otro día -> 400, no 403: es payload mal armado', async () => {
      const { id } = await nuevaSesion();

      await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            {
              dayExerciseId: ejercicioDeOtroDia,
              setNumber: 1,
              completed: true,
            },
          ],
        })
        .expect(400);
    });

    it('acepta series más allá de `targetSets` (series extra)', async () => {
      const { id } = await nuevaSesion();

      const res = await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            {
              dayExerciseId: ex1,
              setNumber: 7,
              actualReps: 6,
              completed: true,
            },
          ],
        })
        .expect(200);

      const session = res.body as WorkoutSessionDto;
      expect(session.setLogs.some((l) => l.setNumber === 7)).toBe(true);
    });

    it('setNumber 0 -> 400', async () => {
      const { id } = await nuevaSesion();

      await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [{ dayExerciseId: ex1, setNumber: 0, completed: true }],
        })
        .expect(400);
    });

    it('sesión de otro -> 403, nunca 401', async () => {
      const { id } = await nuevaSesion();

      await request(http)
        .put(`/sessions/${id}/set-logs`)
        .set(auth(ajeno))
        .send({ setLogs: [] })
        .expect(403);
    });
  });

  describe('PATCH /set-logs/:id', () => {
    it('ausente = no tocar (la regla opuesta a la del PUT)', async () => {
      const { id } = await nuevaSesion();
      const session = (
        await request(http)
          .put(`/sessions/${id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(10) })
      ).body as WorkoutSessionDto;

      const serie = session.setLogs[0];

      const res = await request(http)
        .patch(`/set-logs/${serie.id}`)
        .set(auth(client))
        .send({ completed: false })
        .expect(200);
      const actualizada = res.body as SetLogDto;

      expect(actualizada.completed).toBe(false);
      expect(actualizada.actualReps).toBe(serie.actualReps);
      expect(actualizada.weight).toBe(serie.weight);
    });

    it('serie inexistente -> 404', () =>
      request(http)
        .patch(`/set-logs/${UUID_INEXISTENTE}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(404));
  });

  describe('GET de sesiones', () => {
    it('`GET /days/:dayId/sessions` devuelve array pelado', async () => {
      await nuevaSesion();

      const res = await request(http)
        .get(`/days/${dayId}/sessions`)
        .set(auth(client))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).not.toHaveProperty('data');
      expect((res.body as WorkoutSessionDto[]).length).toBeGreaterThan(0);
    });

    it('el entrenador ve el historial de su cliente', async () => {
      await nuevaSesion();

      const res = await request(http)
        .get(`/days/${dayId}/sessions?userId=${clientId}`)
        .set(auth(trainer))
        .expect(200);

      expect((res.body as WorkoutSessionDto[]).length).toBeGreaterThan(0);
    });

    it('mirar el historial de alguien ajeno -> 403', async () => {
      const otro = (
        (await request(http).get('/auth/me').set(auth(ajeno))).body as UserDto
      ).id;

      await request(http)
        .get(`/days/${dayId}/sessions?userId=${otro}`)
        .set(auth(trainer))
        .expect(403);
    });

    it('inexistente -> 404; sin token -> 401', async () => {
      const { id } = await nuevaSesion();

      await request(http)
        .get(`/sessions/${UUID_INEXISTENTE}`)
        .set(auth(client))
        .expect(404);
      await request(http).get(`/sessions/${id}`).expect(401);
    });
  });
});
