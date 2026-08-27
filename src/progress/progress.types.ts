/**
 * Progreso del macrociclo.
 *
 * NUEVO en el contrato: la sección 4 marca esto como "todavía sin contrato".
 * Las formas replican lo que ya consumen las pantallas mockeadas del front
 * (`lib/routine-data.ts` → `MACROCYCLE` y `HISTORY`), para que cablearlas sea
 * cambiar de dónde salen los datos y nada más.
 *
 * El mapeo con el modelo existente no necesitó tablas nuevas:
 *   Split      = macrociclo
 *   Microcycle = semana   (los microciclos ya se llaman "Semana 1", "Semana 2"…)
 */

/** Una serie del historial. Equivale a `HistSet` del front. */
export interface HistorySetDto {
  weight: number;
  reps: number;
  /**
   * `HistSet` lo declara `number`, pero en la base es nulleable: una serie
   * puede registrarse sin RIR. Se manda como viene en vez de inventar un 0.
   */
  rir: number | null;
}

export interface ExerciseHistoryDto {
  /**
   * El historial se correlaciona POR NOMBRE entre semanas: cada microciclo
   * tiene sus propias filas de `DayExercise`, así que no hay un id compartido.
   * Con los datos reales funciona (los nombres se repiten exactos en las 3
   * semanas), pero si el entrenador renombra un ejercicio a mitad del
   * macrociclo, su historial se parte en dos. Un catálogo de ejercicios lo
   * resolvería de raíz.
   */
  name: string;
  /**
   * Una entrada por semana COMPLETADA, densa desde la semana 1
   * (índice 0 = Semana 1). La semana en curso NO va acá: el front la toma de
   * la sesión viva. Mandarla rompería el gráfico, que distingue "semana pasada"
   * de "hoy" justamente por la ausencia.
   */
  weeks: HistorySetDto[][];
}

export interface SplitProgressDto {
  splitId: string;
  /** Semana en curso, 1-based. Equivale a `MACROCYCLE.week`. */
  week: number;
  /** Cantidad de microciclos vivos. Equivale a `MACROCYCLE.totalWeeks`. */
  totalWeeks: number;
  /** Solo los ejercicios que tienen al menos una semana registrada. */
  exercises: ExerciseHistoryDto[];
}
