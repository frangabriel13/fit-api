import type { UserDto } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { RoutineAccessService } from '../routine/routine-access.service';
import type { SessionsAccessService } from '../sessions/sessions-access.service';
import { ProgressService } from './progress.service';

/**
 * Las reglas del historial de progreso.
 *
 * Se prueban acá y no en e2e porque para cubrirlas haría falta fabricar semanas
 * y sesiones enteras contra la base: son reglas de cálculo, no de HTTP. Con
 * Prisma mockeado se arma cualquier escenario en tres líneas.
 */
const SPLIT = 'split-1';
const USER: UserDto = {
  id: 'user-1',
  email: 'a@b.com',
  name: 'A',
  role: 'client',
  mustChangePassword: false,
};

/** Una serie cruda tal como la devuelve el `select` de `cargarSeries`. */
const serie = (
  semana: number,
  ejercicio: string,
  opciones: {
    setNumber?: number;
    weight?: number;
    reps?: number;
    sessionId?: string;
    performedAt?: string;
  } = {},
) => ({
  setNumber: opciones.setNumber ?? 1,
  weight: opciones.weight ?? 100,
  actualReps: opciones.reps ?? 10,
  actualRir: 2,
  sessionId: opciones.sessionId ?? `s-${semana}`,
  session: {
    performedAt: new Date(opciones.performedAt ?? '2026-01-01'),
    day: { microcycle: { order: semana } },
  },
  dayExercise: { name: ejercicio },
});

type Serie = ReturnType<typeof serie>;

function armar(series: Serie[], totalWeeks = 4) {
  const prisma = {
    microcycle: { count: jest.fn().mockResolvedValue(totalWeeks) },
    setLog: { findMany: jest.fn().mockResolvedValue(series) },
  } as unknown as PrismaService;

  const access = {
    assertSplit: jest.fn().mockResolvedValue(SPLIT),
  } as unknown as RoutineAccessService;

  const assertCanSeeUser = jest.fn().mockResolvedValue(undefined);
  const sessionsAccess = {
    assertCanSeeUser,
  } as unknown as SessionsAccessService;

  return {
    service: new ProgressService(prisma, access, sessionsAccess),
    assertCanSeeUser,
  };
}

describe('ProgressService.forSplit', () => {
  describe('la semana en curso', () => {
    it('sin series entrenadas es la 1', async () => {
      const { service } = armar([]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.week).toBe(1);
      expect(res.exercises).toEqual([]);
    });

    it('es el MÁXIMO, no la sesión más reciente', async () => {
      // Entrenó la semana 3 y después volvió a la 1 a recuperar un día: la
      // posición en el macrociclo no tiene que retroceder.
      const { service } = armar([
        serie(3, 'Sentadilla', { performedAt: '2026-01-10' }),
        serie(1, 'Sentadilla', { performedAt: '2026-01-20' }),
      ]);

      expect((await service.forSplit(USER, SPLIT)).week).toBe(3);
    });

    it('`totalWeeks` sale de contar los microciclos vivos', async () => {
      const { service } = armar([], 6);
      expect((await service.forSplit(USER, SPLIT)).totalWeeks).toBe(6);
    });
  });

  describe('el historial son las semanas TERMINADAS', () => {
    it('entrenando solo la semana 1, el historial va vacío', async () => {
      // No es un bug: no hay ninguna semana anterior contra la cual comparar.
      const { service } = armar([serie(1, 'Sentadilla')]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.week).toBe(1);
      expect(res.exercises).toEqual([]);
    });

    it('en la semana 2, el historial es solo la 1', async () => {
      const { service } = armar([
        serie(1, 'Sentadilla', { weight: 100 }),
        serie(2, 'Sentadilla', { weight: 110 }),
      ]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.week).toBe(2);
      expect(res.exercises).toHaveLength(1);
      expect(res.exercises[0].weeks).toHaveLength(1);
      expect(res.exercises[0].weeks[0][0].weight).toBe(100);
    });

    it('una semana sin registrar va vacía, para no correr los índices', async () => {
      // El front asume índice 0 = Semana 1: si la 2 se saltara, la 3 se
      // dibujaría en el lugar de la 2.
      const { service } = armar([
        serie(1, 'Sentadilla'),
        serie(3, 'Sentadilla'),
        serie(4, 'Sentadilla'),
      ]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.week).toBe(4);
      expect(res.exercises[0].weeks.map((w) => w.length)).toEqual([1, 0, 1]);
    });
  });

  describe('cuando se entrenó dos veces la misma semana', () => {
    it('vale la última sesión: mezclarlas daría una progresión inventada', async () => {
      const { service } = armar([
        serie(1, 'Press', {
          sessionId: 'vieja',
          weight: 80,
          performedAt: '2026-01-01',
        }),
        serie(1, 'Press', {
          sessionId: 'nueva',
          weight: 90,
          performedAt: '2026-01-03',
        }),
        serie(2, 'Press'),
      ]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.exercises[0].weeks[0]).toHaveLength(1);
      expect(res.exercises[0].weeks[0][0].weight).toBe(90);
    });

    it('las series de esa sesión salen ordenadas por número de serie', async () => {
      const { service } = armar([
        serie(1, 'Press', { sessionId: 'u', setNumber: 3, weight: 30 }),
        serie(1, 'Press', { sessionId: 'u', setNumber: 1, weight: 10 }),
        serie(1, 'Press', { sessionId: 'u', setNumber: 2, weight: 20 }),
        serie(2, 'Press'),
      ]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.exercises[0].weeks[0].map((s) => s.weight)).toEqual([
        10, 20, 30,
      ]);
    });
  });

  describe('qué ejercicios entran', () => {
    it('el que no tiene ningún dato no se manda: el front no lo dibuja', async () => {
      const { service } = armar([
        serie(1, 'Sentadilla'),
        // Solo entrenado en la semana en curso: no tiene historial que mostrar.
        serie(2, 'Remo'),
      ]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.exercises.map((e) => e.name)).toEqual(['Sentadilla']);
    });

    it('salen ordenados alfabéticamente, para que la respuesta sea estable', async () => {
      const { service } = armar([
        serie(1, 'Zancadas'),
        serie(1, 'Aperturas'),
        serie(1, 'Press'),
        serie(2, 'Press'),
      ]);
      const res = await service.forSplit(USER, SPLIT);

      expect(res.exercises.map((e) => e.name)).toEqual([
        'Aperturas',
        'Press',
        'Zancadas',
      ]);
    });
  });

  describe('de quién es el progreso', () => {
    it('sin `userId` es el del que llama, y no valida cartera', async () => {
      const { service, assertCanSeeUser } = armar([]);
      await service.forSplit(USER, SPLIT);

      expect(assertCanSeeUser).not.toHaveBeenCalled();
    });

    it('con el `userId` de otro, valida que sea de su cartera', async () => {
      const { service, assertCanSeeUser } = armar([]);
      await service.forSplit(USER, SPLIT, 'otro-user');

      expect(assertCanSeeUser).toHaveBeenCalledWith(USER, 'otro-user');
    });

    it('pedirlo para uno mismo por `userId` no dispara la validación', async () => {
      const { service, assertCanSeeUser } = armar([]);
      await service.forSplit(USER, SPLIT, USER.id);

      expect(assertCanSeeUser).not.toHaveBeenCalled();
    });
  });
});
