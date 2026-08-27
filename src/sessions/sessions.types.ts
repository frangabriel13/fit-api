/** Formas de respuesta del contrato (`types/api.ts` del frontend). */

export interface SetLogDto {
  id: string;
  dayExerciseId: string;
  setNumber: number;
  actualReps: number | null;
  actualRir: number | null;
  weight: number | null;
  completed: boolean;
  /** EXTENSIÓN: serie omitida. El contrato solo tiene `completed`. */
  skipped: boolean;
}

export interface WorkoutSessionDto {
  id: string;
  dayId: string;
  /** ISO 8601 con zona (UTC). El navegador lo convierte a hora local. */
  performedAt: string;
  notes: string | null;
  setLogs: SetLogDto[];
}
