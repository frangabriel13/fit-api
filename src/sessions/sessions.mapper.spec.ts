import type { SetLog, WorkoutSession } from '@prisma/client';

import { toSessionDto, toSetLogDto } from './sessions.mapper';

const setLog = (over: Partial<SetLog> = {}): SetLog => ({
  id: 'log-1',
  sessionId: 'ses-1',
  dayExerciseId: 'ex-1',
  setNumber: 1,
  actualReps: 10,
  actualRir: 2,
  weight: 100,
  completed: true,
  skipped: false,
  ...over,
});

const session = (
  over: Partial<WorkoutSession> = {},
  logs: SetLog[] = [],
): WorkoutSession & { setLogs: SetLog[] } => ({
  id: 'ses-1',
  dayId: 'dia-1',
  userId: 'u-1',
  performedAt: new Date('2026-08-27T15:00:00Z'),
  completedAt: null,
  notes: null,
  setLogs: logs,
  ...over,
});

describe('toSetLogDto', () => {
  it('expone exactamente las claves del contrato, sin filtrar sessionId', () => {
    expect(Object.keys(toSetLogDto(setLog())).sort()).toEqual([
      'actualReps',
      'actualRir',
      'completed',
      'dayExerciseId',
      'id',
      'setNumber',
      'skipped',
      'weight',
    ]);
  });

  it('mantiene los null: "sin dato" no es 0', () => {
    const dto = toSetLogDto(
      setLog({ actualReps: null, actualRir: null, weight: null }),
    );
    expect(dto.actualReps).toBeNull();
    expect(dto.weight).toBeNull();
  });
});

describe('toSessionDto', () => {
  it('`performedAt` sale en ISO con zona: el front compara contra su calendario', () => {
    const dto = toSessionDto(session());
    expect(dto.performedAt).toBe('2026-08-27T15:00:00.000Z');
    expect(dto.performedAt).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
  });

  it('sesión abierta: `completedAt` es null, no ausente', () => {
    const dto = toSessionDto(session());
    expect(dto.completedAt).toBeNull();
    expect(Object.keys(dto)).toContain('completedAt');
  });

  it('sesión cerrada: `completedAt` también sale en ISO', () => {
    const dto = toSessionDto(
      session({ completedAt: new Date('2026-08-27T16:30:00Z') }),
    );
    expect(dto.completedAt).toBe('2026-08-27T16:30:00.000Z');
  });

  it('no filtra el `userId` a la respuesta', () => {
    expect(Object.keys(toSessionDto(session())).sort()).toEqual([
      'completedAt',
      'dayId',
      'id',
      'notes',
      'performedAt',
      'setLogs',
    ]);
  });

  it('mapea las series anidadas', () => {
    const dto = toSessionDto(session({}, [setLog(), setLog({ id: 'log-2' })]));
    expect(dto.setLogs.map((l) => l.id)).toEqual(['log-1', 'log-2']);
  });
});
