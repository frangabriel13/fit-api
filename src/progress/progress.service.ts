import { Injectable } from '@nestjs/common';

import { UserDto } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RoutineAccessService } from '../routine/routine-access.service';
import { SessionsAccessService } from '../sessions/sessions-access.service';
import {
  ExerciseHistoryDto,
  HistorySetDto,
  SplitProgressDto,
} from './progress.types';

/** Una serie ya validada, con la semana y el ejercicio al que pertenece. */
interface SerieCruda {
  semana: number;
  ejercicio: string;
  sessionId: string;
  performedAt: Date;
  setNumber: number;
  set: HistorySetDto;
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RoutineAccessService,
    private readonly sessionsAccess: SessionsAccessService,
  ) {}

  async forSplit(
    user: UserDto,
    splitId: string,
    userId?: string,
  ): Promise<SplitProgressDto> {
    await this.access.assertSplit(user, splitId, 'read');
    const target = userId ?? user.id;
    if (target !== user.id) {
      await this.sessionsAccess.assertCanSeeUser(user, target);
    }

    const totalWeeks = await this.prisma.microcycle.count({
      where: { splitId, deletedAt: null },
    });

    const series = await this.cargarSeries(splitId, target);
    const week = this.semanaEnCurso(series);

    return {
      splitId,
      week,
      totalWeeks,
      exercises: this.armarHistorial(series, week),
    };
  }

  /**
   * Series registradas del usuario en este macrociclo.
   *
   * Solo cuentan las completadas, no omitidas y con peso y reps cargados: una
   * serie a medio llenar no es un dato de progreso, y `HistorySetDto` los
   * necesita para calcular el 1RM estimado.
   */
  private async cargarSeries(
    splitId: string,
    userId: string,
  ): Promise<SerieCruda[]> {
    const logs = await this.prisma.setLog.findMany({
      where: {
        completed: true,
        skipped: false,
        weight: { not: null },
        actualReps: { not: null },
        session: {
          userId,
          day: { microcycle: { splitId, deletedAt: null } },
        },
      },
      select: {
        setNumber: true,
        weight: true,
        actualReps: true,
        actualRir: true,
        sessionId: true,
        session: {
          select: {
            performedAt: true,
            day: { select: { microcycle: { select: { order: true } } } },
          },
        },
        // El ejercicio puede estar borrado de la rutina y su historial sigue
        // siendo válido: por eso no se filtra por `deletedAt`.
        dayExercise: { select: { name: true } },
      },
      orderBy: { setNumber: 'asc' },
    });

    return logs.map((l) => ({
      semana: l.session.day.microcycle.order,
      ejercicio: l.dayExercise.name,
      sessionId: l.sessionId,
      performedAt: l.session.performedAt,
      setNumber: l.setNumber,
      set: {
        weight: l.weight as number,
        reps: l.actualReps as number,
        rir: l.actualRir,
      },
    }));
  }

  /**
   * La semana más avanzada que el usuario llegó a entrenar.
   *
   * Se usa el máximo y no la sesión más reciente a propósito: si vuelve a un
   * día de una semana anterior para recuperarlo, la posición en el macrociclo
   * no debe retroceder ni achicarse el historial.
   */
  private semanaEnCurso(series: SerieCruda[]): number {
    return series.reduce((max, s) => Math.max(max, s.semana), 1);
  }

  /**
   * Arma `weeks` denso desde la semana 1 hasta la anterior a la en curso.
   *
   * Si una semana quedó sin registrar va como array vacío, para no correr los
   * índices: el front asume índice 0 = Semana 1.
   */
  private armarHistorial(
    series: SerieCruda[],
    week: number,
  ): ExerciseHistoryDto[] {
    const completas = series.filter((s) => s.semana < week);

    // ejercicio -> semana -> series de la sesión más reciente de esa semana
    const porEjercicio = new Map<string, Map<number, SerieCruda[]>>();

    for (const serie of completas) {
      const semanas =
        porEjercicio.get(serie.ejercicio) ?? new Map<number, SerieCruda[]>();
      porEjercicio.set(serie.ejercicio, semanas);
      semanas.set(serie.semana, [...(semanas.get(serie.semana) ?? []), serie]);
    }

    const historial: ExerciseHistoryDto[] = [];

    for (const [name, semanas] of porEjercicio) {
      const weeks: HistorySetDto[][] = [];

      for (let n = 1; n < week; n += 1) {
        const deLaSemana = semanas.get(n) ?? [];
        weeks.push(this.seriesDeLaUltimaSesion(deLaSemana));
      }

      // Sin ningún dato el front no lo renderiza; no tiene sentido mandarlo.
      if (weeks.some((w) => w.length > 0)) historial.push({ name, weeks });
    }

    return historial.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Si en una semana se entrenó el mismo día más de una vez, vale la última:
   * mezclar las series de dos sesiones daría una progresión inventada.
   */
  private seriesDeLaUltimaSesion(series: SerieCruda[]): HistorySetDto[] {
    if (series.length === 0) return [];

    const ultima = series.reduce((a, b) =>
      b.performedAt > a.performedAt ? b : a,
    );

    return series
      .filter((s) => s.sessionId === ultima.sessionId)
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => s.set);
  }
}
