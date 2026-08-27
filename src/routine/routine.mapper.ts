import { Day, DayExercise, Microcycle, Split } from '@prisma/client';

import {
  DayDto,
  DayExerciseDto,
  MicrocycleDto,
  SplitDto,
} from './routine.types';

type DayWithExercises = Day & { exercises: DayExercise[] };
type MicrocycleWithDays = Microcycle & { days: DayWithExercises[] };
type SplitWithTree = Split & { microcycles: MicrocycleWithDays[] };

export const toDayExerciseDto = (e: DayExercise): DayExerciseDto => ({
  id: e.id,
  name: e.name,
  order: e.order,
  targetSets: e.targetSets,
  targetRestSeconds: e.targetRestSeconds,
  // El contrato expone un RIR único; la base guarda un rango. Se manda el
  // extremo bajo, que es el objetivo real de la serie.
  targetRir: e.targetRirMin,
  notes: e.notes,
  targetRepsMin: e.targetRepsMin,
  targetRepsMax: e.targetRepsMax,
  targetRirMin: e.targetRirMin,
  targetRirMax: e.targetRirMax,
  toFailure: e.toFailure,
  supersetGroup: e.supersetGroup,
});

export const toDayDto = (d: DayWithExercises): DayDto => ({
  id: d.id,
  name: d.name,
  order: d.order,
  focus: d.focus,
  exercises: d.exercises.map(toDayExerciseDto),
});

export const toMicrocycleDto = (m: MicrocycleWithDays): MicrocycleDto => ({
  id: m.id,
  name: m.name,
  order: m.order,
  days: m.days.map(toDayDto),
});

export const toSplitDto = (s: SplitWithTree): SplitDto => ({
  id: s.id,
  name: s.name,
  description: s.description,
  microcycles: s.microcycles.map(toMicrocycleDto),
});

/** Include de Prisma que trae el árbol completo, ya ordenado por `order`. */
export const SPLIT_TREE_INCLUDE = {
  microcycles: {
    orderBy: { order: 'asc' },
    include: {
      days: {
        orderBy: { order: 'asc' },
        include: { exercises: { orderBy: { order: 'asc' } } },
      },
    },
  },
} as const;
