/**
 * Formas de respuesta del contrato (`types/api.ts` del frontend).
 *
 * Los campos marcados EXTENSIÓN no están en el contrato: salen de la base
 * heredada y los necesitan las pantallas nuevas (/rutina, /progreso). Agregar
 * campos no rompe al front —los ignora— pero sacarlos sí.
 */

export interface DayExerciseDto {
  id: string;
  name: string;
  order: number;
  targetSets: number;
  targetRestSeconds: number | null;
  /** Del contrato. Se deriva de `targetRirMin`, que es lo que guarda la base. */
  targetRir: number | null;
  notes: string | null;

  // EXTENSIONES
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  toFailure: boolean;
  supersetGroup: string | null;
}

export interface DayDto {
  id: string;
  name: string;
  order: number;
  exercises: DayExerciseDto[];
  /** EXTENSIÓN */
  focus: string | null;
}

export interface MicrocycleDto {
  id: string;
  name: string;
  order: number;
  days: DayDto[];
}

export interface SplitDto {
  id: string;
  name: string;
  description: string | null;
  microcycles: MicrocycleDto[];
}
