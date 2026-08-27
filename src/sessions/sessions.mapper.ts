import { Prisma, SetLog, WorkoutSession } from '@prisma/client';

import { SetLogDto, WorkoutSessionDto } from './sessions.types';

type SessionWithLogs = WorkoutSession & { setLogs: SetLog[] };

export const toSetLogDto = (l: SetLog): SetLogDto => ({
  id: l.id,
  dayExerciseId: l.dayExerciseId,
  setNumber: l.setNumber,
  actualReps: l.actualReps,
  actualRir: l.actualRir,
  weight: l.weight,
  completed: l.completed,
  skipped: l.skipped,
});

export const toSessionDto = (s: SessionWithLogs): WorkoutSessionDto => ({
  id: s.id,
  dayId: s.dayId,
  // `.toISOString()` sale en UTC con `Z`: el contrato pide zona explícita.
  performedAt: s.performedAt.toISOString(),
  notes: s.notes,
  setLogs: s.setLogs.map(toSetLogDto),
});

/** Los set-logs siempre ordenados igual, para respuestas estables. */
export const SESSION_INCLUDE = {
  setLogs: { orderBy: [{ dayExerciseId: 'asc' }, { setNumber: 'asc' }] },
} satisfies Prisma.WorkoutSessionInclude;
