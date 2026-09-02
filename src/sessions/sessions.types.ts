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
  /**
   * EXTENSIÓN: null mientras la sesión sigue abierta.
   *
   * Sin esto no se distingue "entrenó y terminó" de "abrió la pantalla y se
   * fue", y el chip de tendencia compara contra lo levantado hasta ahora: a
   * mitad de sesión, con solo la entrada en calor cargada, muestra una caída
   * que no existe.
   */
  completedAt: string | null;
  notes: string | null;
  setLogs: SetLogDto[];
}
