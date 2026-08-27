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

/**
 * Árbol de rutinas: Split -> Microcycle -> Day -> DayExercise.
 *
 * Corre contra la base de desarrollo con los usuarios del seed. Todo lo que
 * crea lo borra al final.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};
const CLIENT = { email: 'diamela@fitness.com', password: 'fitdev1234' };
const AJENO = { email: 'user1@fitback.dev', password: 'fitdev1234' };

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Árbol de rutinas (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  let client: string;
  let ajeno: string;
  let clientId: string;
  let creados: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    const clients = (await request(http).get('/clients').set(auth(trainer)))
      .body as UserDto[];
    clientId = clients[0].id;
  });

  afterAll(async () => {
    // Limpieza: borrar todo lo que crearon los tests.
    for (const id of creados) {
      await request(http).delete(`/splits/${id}`).set(auth(trainer));
    }
    await app.close();
  });

  /** Crea un split de prueba y lo agenda para borrar. */
  const crearSplit = async (extra: Record<string, unknown> = {}) => {
    const res = await request(http)
      .post('/splits')
      .set(auth(trainer))
      .send({ name: 'Split de test', ...extra })
      .expect(201);
    const split = res.body as SplitDto;
    creados.push(split.id);
    return split;
  };

  describe('GET /splits', () => {
    it('devuelve un array pelado, sin envoltorio', async () => {
      const res = await request(http)
        .get('/splits')
        .set(auth(trainer))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).not.toHaveProperty('data');
    });

    it('cada split trae exactamente las claves del contrato', async () => {
      const res = await request(http).get('/splits').set(auth(trainer));
      const splits = res.body as SplitDto[];

      expect(splits.length).toBeGreaterThan(0);
      expect(Object.keys(splits[0]).sort()).toEqual([
        'description',
        'id',
        'microcycles',
        'name',
      ]);
    });

    it('el trainer ve las que armó; un usuario sin rutinas ve []', async () => {
      const mias = (await request(http).get('/splits').set(auth(trainer)))
        .body as SplitDto[];
      const ajenas = (await request(http).get('/splits').set(auth(ajeno)))
        .body as SplitDto[];

      expect(mias.length).toBeGreaterThan(0);
      expect(ajenas).toEqual([]);
    });

    it('el cliente ve las que tiene asignadas', async () => {
      const suyas = (await request(http).get('/splits').set(auth(client)))
        .body as SplitDto[];
      expect(suyas.length).toBeGreaterThan(0);
    });

    it('filtrar por un cliente que no es de tu cartera -> 403', async () => {
      const otros = (await request(http).get('/auth/me').set(auth(ajeno)))
        .body as UserDto;

      await request(http)
        .get(`/splits?clientId=${otros.id}`)
        .set(auth(trainer))
        .expect(403);
    });

    it('sin token -> 401', () => request(http).get('/splits').expect(401));
  });

  describe('GET /splits/:id', () => {
    it('viene anidado completo y ordenado por `order`', async () => {
      // Se arma el árbol acá en vez de tomar "el primer split": las otras
      // suites crean splits contra la misma base y el orden no es estable.
      const base = await crearSplit();
      for (const order of [2, 1]) {
        const micro = (
          await request(http)
            .post(`/splits/${base.id}/microcycles`)
            .set(auth(trainer))
            .send({ name: `Semana ${order}`, order })
        ).body as MicrocycleDto;
        const day = (
          await request(http)
            .post(`/microcycles/${micro.id}/days`)
            .set(auth(trainer))
            .send({ name: 'Día 1', order: 1 })
        ).body as DayDto;
        await request(http)
          .post(`/days/${day.id}/exercises`)
          .set(auth(trainer))
          .send({ name: 'Sentadilla', order: 1, targetSets: 3 });
      }

      const res = await request(http)
        .get(`/splits/${base.id}`)
        .set(auth(trainer))
        .expect(200);
      const split = res.body as SplitDto;

      expect(split.microcycles.length).toBeGreaterThan(0);
      const dias = split.microcycles.flatMap((m) => m.days);
      expect(dias.length).toBeGreaterThan(0);
      expect(dias.flatMap((d) => d.exercises).length).toBeGreaterThan(0);

      const ordenes = split.microcycles.map((m) => m.order);
      expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
    });

    it('inexistente -> 404', () =>
      request(http)
        .get(`/splits/${UUID_INEXISTENTE}`)
        .set(auth(trainer))
        .expect(404));

    it('id malformado -> 400, no 500', () =>
      request(http).get('/splits/no-es-uuid').set(auth(trainer)).expect(400));

    it('rutina de otro -> 403, no 401', async () => {
      const propia = await crearSplit();

      await request(http)
        .get(`/splits/${propia.id}`)
        .set(auth(ajeno))
        .expect(403);
    });
  });

  describe('POST /splits', () => {
    it('un client no puede crear rutinas -> 403', () =>
      request(http)
        .post('/splits')
        .set(auth(client))
        .send({ name: 'No deberia' })
        .expect(403));

    it('el trainer crea y puede asignar al cliente en el mismo paso', async () => {
      const split = await crearSplit({ clientId });

      const delCliente = (await request(http).get('/splits').set(auth(client)))
        .body as SplitDto[];
      expect(delCliente.map((s) => s.id)).toContain(split.id);
    });

    it('nombre vacío -> 400', () =>
      request(http)
        .post('/splits')
        .set(auth(trainer))
        .send({ name: '' })
        .expect(400));
  });

  describe('cadena completa microciclo -> día -> ejercicio', () => {
    it('crea el árbol entero y lo devuelve anidado', async () => {
      const split = await crearSplit();

      const micro = (
        await request(http)
          .post(`/splits/${split.id}/microcycles`)
          .set(auth(trainer))
          .send({ name: 'Semana 1', order: 1 })
          .expect(201)
      ).body as MicrocycleDto;

      const day = (
        await request(http)
          .post(`/microcycles/${micro.id}/days`)
          .set(auth(trainer))
          .send({ name: 'Día 1', order: 1 })
          .expect(201)
      ).body as DayDto;

      const exercise = (
        await request(http)
          .post(`/days/${day.id}/exercises`)
          .set(auth(trainer))
          .send({
            name: 'Press banca',
            order: 1,
            targetSets: 4,
            targetRestSeconds: 120,
            targetRir: 2,
          })
          .expect(201)
      ).body as DayExerciseDto;

      // El contrato expone un RIR único; la base guarda rango.
      expect(exercise.targetRir).toBe(2);
      expect(exercise.targetRirMin).toBe(2);
      expect(exercise.targetRirMax).toBe(2);

      const completo = (
        await request(http).get(`/splits/${split.id}`).set(auth(trainer))
      ).body as SplitDto;

      expect(completo.microcycles[0].days[0].exercises[0].name).toBe(
        'Press banca',
      );
    });
  });

  describe('semántica de PATCH', () => {
    it('campo ausente = no tocar; null explícito = borrar', async () => {
      const split = await crearSplit({ description: 'original' });

      await request(http)
        .patch(`/splits/${split.id}`)
        .set(auth(trainer))
        .send({ name: 'Renombrada' })
        .expect(200);

      const trasNombre = (
        await request(http).get(`/splits/${split.id}`).set(auth(trainer))
      ).body as SplitDto;
      expect(trasNombre.name).toBe('Renombrada');
      expect(trasNombre.description).toBe('original');

      await request(http)
        .patch(`/splits/${split.id}`)
        .set(auth(trainer))
        .send({ description: null })
        .expect(200);

      const trasNull = (
        await request(http).get(`/splits/${split.id}`).set(auth(trainer))
      ).body as SplitDto;
      expect(trasNull.name).toBe('Renombrada');
      expect(trasNull.description).toBeNull();
    });
  });

  describe('el cliente lee pero no escribe', () => {
    it('editar la rutina asignada -> 403, nunca 401', async () => {
      const [suya] = (await request(http).get('/splits').set(auth(client)))
        .body as SplitDto[];

      await request(http)
        .patch(`/splits/${suya.id}`)
        .set(auth(client))
        .send({ name: 'hackeado' })
        .expect(403);
    });

    it('borrar un ejercicio de su rutina -> 403', async () => {
      const suyas = (await request(http).get('/splits').set(auth(client)))
        .body as SplitDto[];
      // Los tests le asignan splits vacíos, así que hay que buscar uno que
      // efectivamente tenga ejercicios.
      const ejercicio = suyas
        .flatMap((s) => s.microcycles)
        .flatMap((m) => m.days)
        .flatMap((d) => d.exercises)[0];
      expect(ejercicio).toBeDefined();

      await request(http)
        .delete(`/exercises/${ejercicio.id}`)
        .set(auth(client))
        .expect(403);
    });
  });

  describe('DELETE', () => {
    it('borra en cascada y devuelve 204', async () => {
      const split = await crearSplit();
      const micro = (
        await request(http)
          .post(`/splits/${split.id}/microcycles`)
          .set(auth(trainer))
          .send({ name: 'Semana 1', order: 1 })
      ).body as MicrocycleDto;
      await request(http)
        .post(`/microcycles/${micro.id}/days`)
        .set(auth(trainer))
        .send({ name: 'Día 1', order: 1 });

      await request(http)
        .delete(`/splits/${split.id}`)
        .set(auth(trainer))
        .expect(204);

      creados = creados.filter((id) => id !== split.id);

      await request(http)
        .get(`/splits/${split.id}`)
        .set(auth(trainer))
        .expect(404);
      await request(http)
        .patch(`/microcycles/${micro.id}`)
        .set(auth(trainer))
        .send({ name: 'x' })
        .expect(404);
    });
  });
});
