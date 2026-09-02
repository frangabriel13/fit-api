import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto } from '../src/auth/auth.types';
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
import type { WorkoutSessionDto } from '../src/sessions/sessions.types';

/**
 * Borrado lógico del árbol de rutinas.
 *
 * Lo que se prueba acá es lo único que importa del soft delete: que sacar algo
 * de la rutina NO destruya las series que el cliente ya registró. Con las FKs
 * en cascada, un borrado real se llevaba el historial por dos caminos
 * (DayExercise -> SetLog, y Day -> WorkoutSession -> SetLog).
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};

describe('Soft delete: el historial sobrevive (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  let client: string;
  let clientId: string;
  const splitsCreados: string[] = [];

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
  });

  afterAll(async () => {
    await purgarSplits(app, splitsCreados);
    await purgarUsuariosDePrueba(app, PREFIJO_CLIENTE);
    await app.close();
  });

  /**
   * Escenario base: una rutina entrenada de verdad. Split -> microciclo -> día
   * con dos ejercicios, y una sesión con series registradas en ambos.
   */
  const escenarioEntrenado = async () => {
    // Un cliente descartable por escenario: solo pueden tener una rutina.
    const cliente = await crearClienteDePrueba(
      http,
      trainer,
      'Cliente soft delete',
    );
    client = cliente.token;
    clientId = cliente.id;

    const split = (
      await request(http)
        .post('/splits')
        .set(auth(trainer))
        .send({ name: 'Rutina entrenada', clientId })
    ).body as SplitDto;
    splitsCreados.push(split.id);

    const micro = (
      await request(http)
        .post(`/splits/${split.id}/microcycles`)
        .set(auth(trainer))
        .send({ name: 'Semana 1', order: 1 })
    ).body as MicrocycleDto;

    const day = (
      await request(http)
        .post(`/microcycles/${micro.id}/days`)
        .set(auth(trainer))
        .send({ name: 'Día 1', order: 1 })
    ).body as DayDto;

    const crearEjercicio = async (name: string, order: number) =>
      (
        await request(http)
          .post(`/days/${day.id}/exercises`)
          .set(auth(trainer))
          .send({ name, order, targetSets: 3 })
      ).body as DayExerciseDto;

    const ex1 = await crearEjercicio('Sentadilla', 1);
    const ex2 = await crearEjercicio('Peso muerto', 2);

    const session = (
      await request(http)
        .post(`/days/${day.id}/sessions`)
        .set(auth(client))
        .send({})
    ).body as WorkoutSessionDto;

    const conSeries = (
      await request(http)
        .put(`/sessions/${session.id}/set-logs`)
        .set(auth(client))
        .send({
          setLogs: [
            {
              dayExerciseId: ex1.id,
              setNumber: 1,
              actualReps: 10,
              weight: 60,
              completed: true,
            },
            {
              dayExerciseId: ex2.id,
              setNumber: 1,
              actualReps: 8,
              weight: 100,
              completed: true,
            },
          ],
        })
        .expect(200)
    ).body as WorkoutSessionDto;

    expect(conSeries.setLogs).toHaveLength(2);
    return { split, micro, day, ex1, ex2, session };
  };

  it('borrar un ejercicio no borra las series ya registradas', async () => {
    const { split, ex1, session } = await escenarioEntrenado();

    await request(http)
      .delete(`/exercises/${ex1.id}`)
      .set(auth(trainer))
      .expect(204);

    // Desaparece de la rutina...
    const rutina = (
      await request(http).get(`/splits/${split.id}`).set(auth(trainer))
    ).body as SplitDto;
    const ejercicios = rutina.microcycles
      .flatMap((m) => m.days)
      .flatMap((d) => d.exercises);
    expect(ejercicios.map((e) => e.id)).not.toContain(ex1.id);
    expect(ejercicios).toHaveLength(1);

    // ...pero el historial queda intacto.
    const historial = (
      await request(http).get(`/sessions/${session.id}`).set(auth(client))
    ).body as WorkoutSessionDto;
    expect(historial.setLogs).toHaveLength(2);

    const serie = historial.setLogs.find((l) => l.dayExerciseId === ex1.id);
    expect(serie?.actualReps).toBe(10);
    expect(serie?.weight).toBe(60);
  });

  it('borrar un día no borra sus sesiones', async () => {
    const { day, session } = await escenarioEntrenado();

    await request(http)
      .delete(`/days/${day.id}`)
      .set(auth(trainer))
      .expect(204);

    const historial = (
      await request(http).get(`/sessions/${session.id}`).set(auth(client))
    ).body as WorkoutSessionDto;
    expect(historial.setLogs).toHaveLength(2);

    // El listado por día también sigue funcionando: si no, borrar un día
    // escondería el historial, que es justo lo que esto vino a evitar.
    const sesiones = (
      await request(http)
        .get(`/days/${day.id}/sessions`)
        .set(auth(client))
        .expect(200)
    ).body as WorkoutSessionDto[];
    expect(sesiones.map((s) => s.id)).toContain(session.id);
  });

  it('borrar el split entero no borra el historial', async () => {
    const { split, session } = await escenarioEntrenado();

    await request(http)
      .delete(`/splits/${split.id}`)
      .set(auth(trainer))
      .expect(204);

    const historial = (
      await request(http).get(`/sessions/${session.id}`).set(auth(client))
    ).body as WorkoutSessionDto;
    expect(historial.setLogs).toHaveLength(2);
    const reps = historial.setLogs
      .map((l) => l.actualReps as number)
      .sort((a, b) => a - b);
    expect(reps).toEqual([8, 10]);
  });

  it('lo borrado se comporta como inexistente: 404', async () => {
    const { split, micro, day, ex1 } = await escenarioEntrenado();

    await request(http).delete(`/splits/${split.id}`).set(auth(trainer));

    await request(http)
      .get(`/splits/${split.id}`)
      .set(auth(trainer))
      .expect(404);
    await request(http)
      .patch(`/microcycles/${micro.id}`)
      .set(auth(trainer))
      .send({ name: 'x' })
      .expect(404);
    await request(http)
      .patch(`/days/${day.id}`)
      .set(auth(trainer))
      .send({ name: 'x' })
      .expect(404);
    await request(http)
      .patch(`/exercises/${ex1.id}`)
      .set(auth(trainer))
      .send({ name: 'x' })
      .expect(404);
  });

  it('no se puede empezar una sesión nueva en un día borrado', async () => {
    const { day } = await escenarioEntrenado();

    await request(http).delete(`/days/${day.id}`).set(auth(trainer));

    await request(http)
      .post(`/days/${day.id}/sessions`)
      .set(auth(client))
      .send({})
      .expect(404);
  });

  it('el borrado baja en cascada: borrar el split marca todo el árbol', async () => {
    const { split, micro, day, ex1 } = await escenarioEntrenado();

    await request(http).delete(`/splits/${split.id}`).set(auth(trainer));

    // Ninguno accesible por su cuenta: el estado quedó consistente.
    for (const url of [
      `/microcycles/${micro.id}`,
      `/days/${day.id}`,
      `/exercises/${ex1.id}`,
    ]) {
      await request(http)
        .patch(url)
        .set(auth(trainer))
        .send({ name: 'x' })
        .expect(404);
    }
  });

  it('la rutina borrada desaparece de los listados', async () => {
    const { split } = await escenarioEntrenado();

    const antes = (await request(http).get('/splits').set(auth(trainer)))
      .body as SplitDto[];
    expect(antes.map((s) => s.id)).toContain(split.id);

    await request(http).delete(`/splits/${split.id}`).set(auth(trainer));

    const despues = (await request(http).get('/splits').set(auth(trainer)))
      .body as SplitDto[];
    expect(despues.map((s) => s.id)).not.toContain(split.id);

    // Tampoco para el cliente que la tenía asignada.
    const delCliente = (await request(http).get('/splits').set(auth(client)))
      .body as SplitDto[];
    expect(delCliente.map((s) => s.id)).not.toContain(split.id);
  });
});
