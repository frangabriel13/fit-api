import { Day, DayExercise, Microcycle, Prisma, Split } from '@prisma/client';

import {
  DayDto,
  DayExerciseDto,
  MicrocycleDto,
  SplitDto,
} from './routine.types';

type DayWithExercises = Day & { exercises: DayExercise[] };
type MicrocycleWithDays = Microcycle & { days: DayWithExercises[] };
type SplitWithTree = Split & {
  microcycles: MicrocycleWithDays[];
  assignments: { client: { id: string; name: string } }[];
};

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
  clients: s.assignments.map((a) => a.client),
});

/** Filtro de soft delete: lo borrado no se lee. */
export const VIVO = { deletedAt: null } as const;

/**
 * Include de Prisma que trae el árbol completo, ordenado por `order` y sin lo
 * borrado. El filtro va en cada nivel: un día borrado no debe arrastrar sus
 * ejercicios a la respuesta.
 */
export const SPLIT_TREE_INCLUDE = {
  // Sin esto el editor puede asignar una rutina pero no mostrar a quién se la
  // asignó. Un cliente dado de baja no cuenta: su asignación no se muestra.
  assignments: {
    where: { isActive: true, client: { deletedAt: null } },
    select: { client: { select: { id: true, name: true } } },
    orderBy: { assignedAt: 'asc' },
  },
  microcycles: {
    where: VIVO,
    orderBy: { order: 'asc' },
    include: {
      days: {
        where: VIVO,
        orderBy: { order: 'asc' },
        include: { exercises: { where: VIVO, orderBy: { order: 'asc' } } },
      },
    },
  },
} satisfies Prisma.SplitInclude;
