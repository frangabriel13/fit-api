import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import type { SplitProgressDto } from '../src/progress/progress.types';
import type {
  DayDto,
  DayExerciseDto,
  MicrocycleDto,
  SplitDto,
} from '../src/routine/routine.types';
import type { WorkoutSessionDto } from '../src/sessions/sessions.types';
import {
  crearClienteDePrueba,
  PREFIJO_CLIENTE,
  purgarSplits,
  purgarUsuariosDePrueba,
} from './helpers';

/**
 * Progreso del macrociclo.
 *
 * El mapeo es Split = macrociclo y Microcycle = semana, así que los tests
 * arman macrociclos de varias semanas y los "entrenan" para verificar que el
 * historial salga con la forma que ya consume el front.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};
const AJENO = { email: 'user1@fitback.dev', password: 'fitdev1234' };

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

interface Semana {
  numero: number;
  dayId: string;
  ejercicios: Record<string, string>;
}

describe('Progreso del macrociclo (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainer: string;
  let client: string;
  let ajeno: string;
  let clientId: string;
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

    const login = async (body: typeof TRAINER) =>
      (
        (await request(http).post('/auth/login').send(body))
          .body as LoginResponseDto
      ).accessToken;

    trainer = await login(TRAINER);
    ajeno = await login(AJENO);
  });

  afterAll(async () => {
    await purgarSplits(app, creados);
    await purgarUsuariosDePrueba(app, PREFIJO_CLIENTE);
    await app.close();
  });

  /** Macrociclo de N semanas, un día por semana con los mismos ejercicios. */
  const crearMacrociclo = async (
    totalSemanas: number,
    nombres: string[] = ['Hip Thrust', 'Peso Muerto Rumano'],
  ) => {
    // Un cliente descartable por macrociclo: cada uno solo puede tener una
    // rutina activa, así que dos macrociclos no entran en la misma persona.
    const cliente = await crearClienteDePrueba(
      http,
      trainer,
      'Cliente progreso',
    );
    client = cliente.token;
    clientId = cliente.id;

    const split = (
      await request(http)
        .post('/splits')
        .set(auth(trainer))
        .send({ name: 'Macrociclo de test', clientId })
    ).body as SplitDto;
    creados.push(split.id);

    const semanas: Semana[] = [];

    for (let n = 1; n <= totalSemanas; n += 1) {
      const micro = (
        await request(http)
          .post(`/splits/${split.id}/microcycles`)
          .set(auth(trainer))
          .send({ name: `Semana ${n}`, order: n })
      ).body as MicrocycleDto;

      const day = (
        await request(http)
          .post(`/microcycles/${micro.id}/days`)
          .set(auth(trainer))
          .send({ name: 'Día 1', order: 1 })
      ).body as DayDto;

      const ejercicios: Record<string, string> = {};
      for (const [i, name] of nombres.entries()) {
        const ex = (
          await request(http)
            .post(`/days/${day.id}/exercises`)
            .set(auth(trainer))
            .send({ name, order: i + 1, targetSets: 3 })
        ).body as DayExerciseDto;
        ejercicios[name] = ex.id;
      }

      semanas.push({ numero: n, dayId: day.id, ejercicios });
    }

    return { split, semanas };
  };

  /** Registra series en una semana. */
  const entrenar = async (
    semana: Semana,
    setLogs: Record<string, unknown>[],
  ) => {
    const session = (
      await request(http)
        .post(`/days/${semana.dayId}/sessions`)
        .set(auth(client))
        .send({})
    ).body as WorkoutSessionDto;

    await request(http)
      .put(`/sessions/${session.id}/set-logs`)
      .set(auth(client))
      .send({ setLogs })
      .expect(200);

    return session;
  };

  /** Tres series de un ejercicio, con el peso que se le pase. */
  const seriesDe = (exId: string, weight: number) =>
    [1, 2, 3].map((n) => ({
      dayExerciseId: exId,
      setNumber: n,
      weight,
      actualReps: 13 - n,
      actualRir: 1,
      completed: true,
    }));

  const progreso = async (splitId: string, token = client, userId?: string) => {
    const url = userId
      ? `/splits/${splitId}/progress?userId=${userId}`
      : `/splits/${splitId}/progress`;
    return (await request(http).get(url).set(auth(token)).expect(200))
      .body as SplitProgressDto;
  };

  describe('posición en el macrociclo', () => {
    it('totalWeeks son los microciclos; sin entrenar, semana 1', async () => {
      const { split } = await crearMacrociclo(4);

      const p = await progreso(split.id);
      expect(p.totalWeeks).toBe(4);
      expect(p.week).toBe(1);
      expect(p.exercises).toEqual([]);
    });

    it('la semana en curso es la más avanzada entrenada', async () => {
      const { split, semanas } = await crearMacrociclo(4);
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );

      expect((await progreso(split.id)).week).toBe(2);
    });

    it('volver a una semana anterior no hace retroceder la posición', async () => {
      const { split, semanas } = await crearMacrociclo(3);
      await entrenar(
        semanas[2],
        seriesDe(semanas[2].ejercicios['Hip Thrust'], 60),
      );
      // Sesión de recuperación en la semana 1, posterior en el tiempo.
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );

      expect((await progreso(split.id)).week).toBe(3);
    });
  });

  describe('historial por ejercicio', () => {
    it('una entrada por semana completada, densa desde la semana 1', async () => {
      const { split, semanas } = await crearMacrociclo(3);
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );
      await entrenar(
        semanas[2],
        seriesDe(semanas[2].ejercicios['Hip Thrust'], 60),
      );

      const p = await progreso(split.id);
      const hip = p.exercises.find((e) => e.name === 'Hip Thrust');

      // Semana 3 es la de hoy: no va en el historial.
      expect(hip?.weeks).toHaveLength(2);
      expect(hip?.weeks[0][0].weight).toBe(50);
      expect(hip?.weeks[1][0].weight).toBe(55);
      expect(hip?.weeks[0]).toHaveLength(3);
    });

    it('las series salen ordenadas por setNumber', async () => {
      const { split, semanas } = await crearMacrociclo(2);
      const ex = semanas[0].ejercicios['Hip Thrust'];
      // A propósito desordenadas en el payload.
      await entrenar(semanas[0], [
        {
          dayExerciseId: ex,
          setNumber: 3,
          weight: 50,
          actualReps: 10,
          completed: true,
        },
        {
          dayExerciseId: ex,
          setNumber: 1,
          weight: 50,
          actualReps: 12,
          completed: true,
        },
        {
          dayExerciseId: ex,
          setNumber: 2,
          weight: 50,
          actualReps: 11,
          completed: true,
        },
      ]);
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );

      const p = await progreso(split.id);
      const reps = p.exercises
        .find((e) => e.name === 'Hip Thrust')
        ?.weeks[0].map((s) => s.reps);
      expect(reps).toEqual([12, 11, 10]);
    });

    it('una semana sin registrar va vacía, sin correr los índices', async () => {
      const { split, semanas } = await crearMacrociclo(3);
      // Se saltea la semana 2.
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );
      await entrenar(
        semanas[2],
        seriesDe(semanas[2].ejercicios['Hip Thrust'], 60),
      );

      const p = await progreso(split.id);
      const hip = p.exercises.find((e) => e.name === 'Hip Thrust');

      expect(hip?.weeks).toHaveLength(2);
      expect(hip?.weeks[0]).toHaveLength(3);
      expect(hip?.weeks[1]).toEqual([]);
    });

    it('correlaciona el mismo ejercicio entre semanas por nombre', async () => {
      const { split, semanas } = await crearMacrociclo(3);
      for (const s of semanas) {
        await entrenar(s, [
          ...seriesDe(s.ejercicios['Hip Thrust'], 50 + s.numero),
          ...seriesDe(s.ejercicios['Peso Muerto Rumano'], 70 + s.numero),
        ]);
      }

      const p = await progreso(split.id);
      expect(p.exercises.map((e) => e.name)).toEqual([
        'Hip Thrust',
        'Peso Muerto Rumano',
      ]);

      const hip = p.exercises.find((e) => e.name === 'Hip Thrust');
      expect(hip?.weeks.map((w) => w[0].weight)).toEqual([51, 52]);
    });

    it('solo cuentan las series completadas y con peso y reps', async () => {
      const { split, semanas } = await crearMacrociclo(2);
      const ex = semanas[0].ejercicios['Hip Thrust'];
      await entrenar(semanas[0], [
        {
          dayExerciseId: ex,
          setNumber: 1,
          weight: 50,
          actualReps: 12,
          completed: true,
        },
        // sin completar
        {
          dayExerciseId: ex,
          setNumber: 2,
          weight: 50,
          actualReps: 11,
          completed: false,
        },
        // completada pero sin peso
        { dayExerciseId: ex, setNumber: 3, actualReps: 10, completed: true },
        // omitida
        {
          dayExerciseId: ex,
          setNumber: 4,
          weight: 50,
          actualReps: 9,
          completed: true,
          skipped: true,
        },
      ]);
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );

      const p = await progreso(split.id);
      const semana1 = p.exercises.find((e) => e.name === 'Hip Thrust')
        ?.weeks[0];
      expect(semana1).toHaveLength(1);
      expect(semana1?.[0]).toEqual({ weight: 50, reps: 12, rir: null });
    });

    it('los ejercicios sin ninguna serie registrada no aparecen', async () => {
      const { split, semanas } = await crearMacrociclo(2);
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );

      const p = await progreso(split.id);
      expect(p.exercises.map((e) => e.name)).toEqual(['Hip Thrust']);
    });

    it('el historial sobrevive a borrar el ejercicio de la rutina', async () => {
      const { split, semanas } = await crearMacrociclo(2);
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );

      await request(http)
        .delete(`/exercises/${semanas[0].ejercicios['Hip Thrust']}`)
        .set(auth(trainer))
        .expect(204);

      const p = await progreso(split.id);
      const hip = p.exercises.find((e) => e.name === 'Hip Thrust');
      expect(hip?.weeks[0]).toHaveLength(3);
    });
  });

  describe('permisos', () => {
    it('el entrenador ve el progreso de su cliente con ?userId', async () => {
      const { split, semanas } = await crearMacrociclo(2);
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );
      await entrenar(
        semanas[1],
        seriesDe(semanas[1].ejercicios['Hip Thrust'], 55),
      );

      const p = await progreso(split.id, trainer, clientId);
      expect(p.week).toBe(2);
      expect(p.exercises).toHaveLength(1);
    });

    it('sin ?userId el entrenador ve el suyo, que está vacío', async () => {
      const { split, semanas } = await crearMacrociclo(2);
      await entrenar(
        semanas[0],
        seriesDe(semanas[0].ejercicios['Hip Thrust'], 50),
      );

      const p = await progreso(split.id, trainer);
      expect(p.exercises).toEqual([]);
    });

    it('progreso de alguien ajeno -> 403', async () => {
      const { split } = await crearMacrociclo(2);
      const otro = (
        (await request(http).get('/auth/me').set(auth(ajeno))).body as UserDto
      ).id;

      await request(http)
        .get(`/splits/${split.id}/progress?userId=${otro}`)
        .set(auth(trainer))
        .expect(403);
    });

    it('rutina de otro -> 403; inexistente -> 404; sin token -> 401', async () => {
      const { split } = await crearMacrociclo(2);

      await request(http)
        .get(`/splits/${split.id}/progress`)
        .set(auth(ajeno))
        .expect(403);
      await request(http)
        .get(`/splits/${UUID_INEXISTENTE}/progress`)
        .set(auth(client))
        .expect(404);
      await request(http).get(`/splits/${split.id}/progress`).expect(401);
    });
  });
});
