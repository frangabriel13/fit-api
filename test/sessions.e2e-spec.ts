import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import {
  crearClienteDePrueba,
  PREFIJO_CLIENTE,
  purgarSplits,
  purgarUsuariosDePrueba,
} from './helpers';
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
  let microId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** El estado completo de la grilla, como lo manda el front en cada PUT. */
  const grilla = (reps: number, a = ex1, b = ex2) => [
    ...[1, 2, 3].map((n) => ({
      dayExerciseId: a,
      setNumber: n,
      actualReps: reps,
      actualRir: 1,
      weight: 60 + n,
      completed: true,
    })),
    ...[1, 2].map((n) => ({
      dayExerciseId: b,
      setNumber: n,
      actualReps: reps,
      actualRir: 2,
      weight: 100 + n,
      completed: true,
    })),
  ];

  /** Sesión sobre el día compartido. Ojo: el POST es idempotente por día, así
   *  que devuelve SIEMPRE la misma sesión. Solo para los tests que lo quieren. */
  const nuevaSesion = async (): Promise<WorkoutSessionDto> =>
    (
      await request(http)
        .post(`/days/${dayId}/sessions`)
        .set(auth(client))
        .send({})
        .expect(201)
    ).body as WorkoutSessionDto;

  /**
   * Contexto aislado: día nuevo con sus propios ejercicios y una sesión limpia.
   *
   * Hace falta porque el POST es idempotente por (día, usuario, fecha): dos
   * tests sobre el mismo día comparten la sesión y se pisan los set-logs.
   */
  let nDia = 0;
  const contextoLimpio = async () => {
    nDia += 1;
    const day = (
      await request(http)
        .post(`/microcycles/${microId}/days`)
        .set(auth(trainer))
        .send({ name: `Día aislado ${nDia}`, order: 100 + nDia })
    ).body as DayDto;

    const crear = async (name: string, order: number) =>
      (
        (
          await request(http)
            .post(`/days/${day.id}/exercises`)
            .set(auth(trainer))
            .send({ name, order, targetSets: 3 })
        ).body as DayExerciseDto
      ).id;

    const a = await crear('Sentadilla', 1);
    const b = await crear('Peso muerto', 2);

    const session = (
      await request(http)
        .post(`/days/${day.id}/sessions`)
        .set(auth(client))
        .send({})
        .expect(201)
    ).body as WorkoutSessionDto;

    return { dayId: day.id, ex1: a, ex2: b, session };
  };

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

    // Cliente propio del suite: la del seed ya tiene rutina y asignarle otra
    // ahora responde 409.
    const cliente = await crearClienteDePrueba(
      http,
      trainer,
      'Cliente sesiones',
    );
    client = cliente.token;
    clientId = cliente.id;

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
    microId = micro.id;

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
    await purgarSplits(app, [splitId]);
    await purgarUsuariosDePrueba(app, PREFIJO_CLIENTE);
    await app.close();
  });

  describe('POST /days/:dayId/sessions', () => {
    it('acepta body vacío y devuelve la sesión completa', async () => {
      const session = await nuevaSesion();

      expect(Object.keys(session).sort()).toEqual([
        // `completedAt` es extensión: null mientras la sesión sigue abierta.
        'completedAt',
        'dayId',
        'id',
        'notes',
        'performedAt',
        'setLogs',
      ]);
      expect(session.dayId).toBe(dayId);
      expect(session.completedAt).toBeNull();
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
      const { session, ex1: a, ex2: b } = await contextoLimpio();

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10, a, b) })
        .expect(200);
      const actualizada = res.body as WorkoutSessionDto;

      expect(actualizada.id).toBe(session.id);
      expect(actualizada.setLogs).toHaveLength(5);
    });

    it('la clave natural es (sesión, ejercicio, serie): actualiza, no duplica', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10, a, b) });

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            {
              dayExerciseId: a,
              setNumber: 1,
              actualReps: 12,
              actualRir: 0,
              weight: 99,
              completed: true,
            },
          ],
        })
        .expect(200);
      const actualizada = res.body as WorkoutSessionDto;

      expect(actualizada.setLogs).toHaveLength(5);
      const serie = actualizada.setLogs.find(
        (l) => l.dayExerciseId === a && l.setNumber === 1,
      );
      expect(serie?.actualReps).toBe(12);
      expect(serie?.weight).toBe(99);
    });

    it('NO es reemplazo total: lo que no viene en el body queda intacto', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10, a, b) });

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            { dayExerciseId: a, setNumber: 1, actualReps: 5, completed: true },
          ],
        });
      const actualizada = res.body as WorkoutSessionDto;

      expect(actualizada.setLogs).toHaveLength(5);
      const intacta = actualizada.setLogs.find(
        (l) => l.dayExerciseId === b && l.setNumber === 1,
      );
      expect(intacta?.actualReps).toBe(10);
      expect(intacta?.weight).toBe(101);
    });

    it('campo numérico ausente se guarda NULL, no 0', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10, a, b) });

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [{ dayExerciseId: a, setNumber: 1, completed: false }],
        });
      const actualizada = res.body as WorkoutSessionDto;

      const serie = actualizada.setLogs.find(
        (l) => l.dayExerciseId === a && l.setNumber === 1,
      );
      expect(serie?.actualReps).toBeNull();
      expect(serie?.actualRir).toBeNull();
      expect(serie?.weight).toBeNull();
      expect(serie?.actualReps).not.toBe(0);
    });

    it('es idempotente: el mismo payload dos veces da el mismo estado', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      const enviar = () =>
        request(http)
          .put(`/sessions/${session.id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(8, a, b) });

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
      const { session, ex1: a, ex2: b } = await contextoLimpio();

      // El front lo dispara con debounce de 800ms y al toque al completar una
      // serie: los requests se pisan.
      const respuestas = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          request(http)
            .put(`/sessions/${session.id}/set-logs`)
            .set(auth(client))
            .send({ setLogs: grilla(10 + i, a, b) }),
        ),
      );

      respuestas.forEach((r) => expect(r.status).toBe(200));

      const final = (
        await request(http).get(`/sessions/${session.id}`).set(auth(client))
      ).body as WorkoutSessionDto;

      expect(final.setLogs).toHaveLength(5);
      const claves = final.setLogs.map(
        (l) => `${l.dayExerciseId}:${l.setNumber}`,
      );
      expect(new Set(claves).size).toBe(claves.length);
    });

    it('un ejercicio de otro día -> 400, no 403: es payload mal armado', async () => {
      const { session } = await contextoLimpio();

      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
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
      const { session, ex1: a } = await contextoLimpio();

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            { dayExerciseId: a, setNumber: 7, actualReps: 6, completed: true },
          ],
        })
        .expect(200);

      const actualizada = res.body as WorkoutSessionDto;
      expect(actualizada.setLogs.some((l) => l.setNumber === 7)).toBe(true);
    });

    it('setNumber 0 -> 400', async () => {
      const { session, ex1: a } = await contextoLimpio();

      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [{ dayExerciseId: a, setNumber: 0, completed: true }],
        })
        .expect(400);
    });

    it('sesión de otro -> 403, nunca 401', async () => {
      const { session } = await contextoLimpio();

      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(ajeno))
        .send({ setLogs: [] })
        .expect(403);
    });
  });

  describe('PATCH /set-logs/:id', () => {
    it('ausente = no tocar (la regla opuesta a la del PUT)', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      const conLogs = (
        await request(http)
          .put(`/sessions/${session.id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(10, a, b) })
      ).body as WorkoutSessionDto;

      const serie = conLogs.setLogs[0];

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

  describe('DELETE /set-logs/:id', () => {
    it('borra la serie y deja de aparecer en la sesión', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      const conLogs = (
        await request(http)
          .put(`/sessions/${session.id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(10, a, b) })
      ).body as WorkoutSessionDto;

      expect(conLogs.setLogs).toHaveLength(5);
      const serie = conLogs.setLogs[0];

      await request(http)
        .delete(`/set-logs/${serie.id}`)
        .set(auth(client))
        .expect(204);

      const despues = (
        await request(http).get(`/sessions/${session.id}`).set(auth(client))
      ).body as WorkoutSessionDto;

      expect(despues.setLogs).toHaveLength(4);
      expect(despues.setLogs.map((l) => l.id)).not.toContain(serie.id);
    });

    it('borrada de verdad: un PUT posterior no la resucita', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      const conLogs = (
        await request(http)
          .put(`/sessions/${session.id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(10, a, b) })
      ).body as WorkoutSessionDto;

      const serie = conLogs.setLogs.find(
        (l) => l.dayExerciseId === b && l.setNumber === 2,
      );
      expect(serie).toBeDefined();

      await request(http)
        .delete(`/set-logs/${serie!.id}`)
        .set(auth(client))
        .expect(204);

      // Un PUT que no incluye esa serie no debe traerla de vuelta.
      const despues = (
        await request(http)
          .put(`/sessions/${session.id}/set-logs`)
          .set(auth(client))
          .send({
            setLogs: [
              {
                dayExerciseId: a,
                setNumber: 1,
                actualReps: 7,
                completed: true,
              },
            ],
          })
      ).body as WorkoutSessionDto;

      expect(despues.setLogs).toHaveLength(4);
      expect(
        despues.setLogs.some((l) => l.dayExerciseId === b && l.setNumber === 2),
      ).toBe(false);
    });

    it('serie de otro -> 403; inexistente -> 404', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      const conLogs = (
        await request(http)
          .put(`/sessions/${session.id}/set-logs`)
          .set(auth(client))
          .send({ setLogs: grilla(10, a, b) })
      ).body as WorkoutSessionDto;

      await request(http)
        .delete(`/set-logs/${conLogs.setLogs[0].id}`)
        .set(auth(ajeno))
        .expect(403);
      await request(http)
        .delete(`/set-logs/${UUID_INEXISTENTE}`)
        .set(auth(client))
        .expect(404);
    });
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

    it('acepta `clientId` como alias de `userId`, en vez de ignorarlo', async () => {
      const porUserId = await request(http)
        .get(`/days/${dayId}/sessions?userId=${clientId}`)
        .set(auth(trainer))
        .expect(200);
      const porClientId = await request(http)
        .get(`/days/${dayId}/sessions?clientId=${clientId}`)
        .set(auth(trainer))
        .expect(200);

      // Antes `clientId` se descartaba en silencio y devolvía las del
      // entrenador: 200 con los datos de otra persona y ningún aviso.
      expect(porClientId.body).toEqual(porUserId.body);
      expect((porClientId.body as WorkoutSessionDto[]).length).toBeGreaterThan(
        0,
      );
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
  describe('PATCH /sessions/:id — cerrar la sesión', () => {
    it('nace abierta: completedAt es null', async () => {
      const { session } = await contextoLimpio();
      expect(session.completedAt).toBeNull();
    });

    it('completed: true la cierra con la hora del server', async () => {
      const { session } = await contextoLimpio();

      const res = await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(200);

      const cerrada = res.body as WorkoutSessionDto;
      expect(cerrada.completedAt).toEqual(expect.any(String) as unknown);
      expect(new Date(cerrada.completedAt as string).getTime()).not.toBeNaN();
    });

    it('cerrarla dos veces conserva la hora del primer cierre', async () => {
      const { session } = await contextoLimpio();

      const primera = (
        await request(http)
          .patch(`/sessions/${session.id}`)
          .set(auth(client))
          .send({ completed: true })
          .expect(200)
      ).body as WorkoutSessionDto;

      const segunda = (
        await request(http)
          .patch(`/sessions/${session.id}`)
          .set(auth(client))
          .send({ completed: true })
          .expect(200)
      ).body as WorkoutSessionDto;

      expect(segunda.completedAt).toBe(primera.completedAt);
    });

    it('completed: false la reabre', async () => {
      const { session } = await contextoLimpio();

      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(200);

      const reabierta = (
        await request(http)
          .patch(`/sessions/${session.id}`)
          .set(auth(client))
          .send({ completed: false })
          .expect(200)
      ).body as WorkoutSessionDto;

      expect(reabierta.completedAt).toBeNull();
    });

    it('edita las notas sin tocar el cierre', async () => {
      const { session } = await contextoLimpio();
      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(200);

      const res = await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ notes: 'Pesada la última serie' })
        .expect(200);

      const s = res.body as WorkoutSessionDto;
      expect(s.notes).toBe('Pesada la última serie');
      expect(s.completedAt).not.toBeNull();
    });

    it('el cierre sobrevive a un PUT de series posterior', async () => {
      const { session, ex1: a, ex2: b } = await contextoLimpio();
      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(200);

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10, a, b) })
        .expect(200);

      expect((res.body as WorkoutSessionDto).completedAt).not.toBeNull();
    });

    it('completed no booleano -> 400', async () => {
      const { session } = await contextoLimpio();
      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: 'si' })
        .expect(400);
    });

    it('sesión de otro -> 403, nunca 401; inexistente -> 404', async () => {
      const { session } = await contextoLimpio();

      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(ajeno))
        .send({ completed: true })
        .expect(403);

      await request(http)
        .patch(`/sessions/${UUID_INEXISTENTE}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(404);
    });

    it('el entrenador puede cerrar la sesión de su cliente', async () => {
      const { session } = await contextoLimpio();

      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(trainer))
        .send({ completed: true })
        .expect(200);
    });
  });

  describe('DELETE /sessions/:id — descartar una sesión abierta', () => {
    it('borra la sesión abierta y sus series', async () => {
      const { dayId: d, session, ex1: a, ex2: b } = await contextoLimpio();
      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: grilla(10, a, b) })
        .expect(200);

      await request(http)
        .delete(`/sessions/${session.id}`)
        .set(auth(client))
        .expect(204);

      await request(http)
        .get(`/sessions/${session.id}`)
        .set(auth(client))
        .expect(404);

      const delDia = (
        await request(http)
          .get(`/days/${d}/sessions`)
          .set(auth(client))
          .expect(200)
      ).body as WorkoutSessionDto[];
      expect(delDia).toEqual([]);
    });

    it('una sesión ya cerrada es historial -> 409', async () => {
      const { session } = await contextoLimpio();
      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(200);

      const res = await request(http)
        .delete(`/sessions/${session.id}`)
        .set(auth(client))
        .expect(409);
      expect(typeof (res.body as { message: string }).message).toBe('string');
    });

    it('reabrirla vuelve a permitir borrarla', async () => {
      const { session } = await contextoLimpio();
      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: true })
        .expect(200);
      await request(http)
        .patch(`/sessions/${session.id}`)
        .set(auth(client))
        .send({ completed: false })
        .expect(200);

      await request(http)
        .delete(`/sessions/${session.id}`)
        .set(auth(client))
        .expect(204);
    });

    it('sesión de otro -> 403; inexistente -> 404; sin token -> 401', async () => {
      const { session } = await contextoLimpio();

      await request(http)
        .delete(`/sessions/${session.id}`)
        .set(auth(ajeno))
        .expect(403);
      await request(http)
        .delete(`/sessions/${UUID_INEXISTENTE}`)
        .set(auth(client))
        .expect(404);
      await request(http).delete(`/sessions/${session.id}`).expect(401);
    });
  });

  describe('el 400 del upsert apunta al problema real', () => {
    it('mandar el array pelado dice que falta el array, no que sobran series', async () => {
      const { session } = await contextoLimpio();

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send([])
        .expect(400);

      const { message } = res.body as { message: string };
      expect(message).toContain('array');
      // El tope no tiene nada que ver con un body mal formado.
      expect(message).not.toContain('demasiadas');
    });

    it('un lote grande pero válido pasa', async () => {
      const { session, ex1: a } = await contextoLimpio();
      const lote = Array.from({ length: 101 }, (_, i) => ({
        dayExerciseId: a,
        setNumber: i + 1,
        completed: false,
      }));

      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: lote })
        .expect(200);
    });

    it('pasado el tope -> 400 diciendo que son demasiadas', async () => {
      const { session, ex1: a } = await contextoLimpio();
      const lote = Array.from({ length: 501 }, (_, i) => ({
        dayExerciseId: a,
        setNumber: i + 1,
        completed: false,
      }));

      const res = await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({ setLogs: lote })
        .expect(400);

      expect((res.body as { message: string }).message).toContain('demasiadas');
    });
  });
});
