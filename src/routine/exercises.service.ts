import { Injectable } from '@nestjs/common';

import { UserDto } from '../auth/auth.types';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDayExerciseDto,
  UpdateDayExerciseDto,
} from './dto/day-exercise.dto';
import { RoutineAccessService } from './routine-access.service';
import { aplicarReorden, conOrdenUnico } from './reorder';
import { VIVO, toDayExerciseDto } from './routine.mapper';
import { softDeleteExercise } from './soft-delete';
import { DayExerciseDto } from './routine.types';

/** Rango de RIR resuelto a partir de lo que haya mandado el cliente. */
interface RirRange {
  targetRirMin?: number | null;
  targetRirMax?: number | null;
}

@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RoutineAccessService,
  ) {}

  /**
   * El contrato manda un `targetRir` único y la base guarda un rango. Si vino
   * el suelto y no el rango, se fija min = max = ese valor; si vino el rango
   * explícito, manda el rango.
   */
  private rirRange(dto: UpdateDayExerciseDto): RirRange {
    const { targetRir, targetRirMin, targetRirMax } = dto;
    if (targetRir === undefined) return { targetRirMin, targetRirMax };
    return {
      targetRirMin: targetRirMin ?? targetRir,
      targetRirMax: targetRirMax ?? targetRir,
    };
  }

  async create(
    user: UserDto,
    dayId: string,
    dto: CreateDayExerciseDto,
  ): Promise<DayExerciseDto> {
    await this.access.assertDay(user, dayId, 'write');
    const rir = this.rirRange(dto);

    const exercise = await conOrdenUnico(() =>
      this.prisma.dayExercise.create({
        data: {
          dayId,
          name: dto.name,
          order: dto.order,
          targetSets: dto.targetSets,
          targetRestSeconds: dto.targetRestSeconds ?? null,
          notes: dto.notes ?? null,
          targetRepsMin: dto.targetRepsMin ?? null,
          targetRepsMax: dto.targetRepsMax ?? null,
          targetRirMin: rir.targetRirMin ?? null,
          targetRirMax: rir.targetRirMax ?? null,
          toFailure: dto.toFailure ?? false,
          supersetGroup: dto.supersetGroup ?? null,
        },
      }),
    );
    return toDayExerciseDto(exercise);
  }

  async update(
    user: UserDto,
    id: string,
    dto: UpdateDayExerciseDto,
  ): Promise<DayExerciseDto> {
    await this.access.assertExercise(user, id, 'write');

    // Ninguno de los dos es una columna: `targetRir` se traduce al rango
    // min/max, y `applyToAll` es una instrucción, no un dato.
    const { targetRir, applyToAll, ...rest } = dto;
    void targetRir;

    if (applyToAll && rest.name !== undefined) {
      await this.renombrarEnLaRutina(id, rest.name);
    }

    const exercise = await conOrdenUnico(() =>
      this.prisma.dayExercise.update({
        where: { id },
        data: patchData({ ...rest, ...this.rirRange(dto) }),
      }),
    );
    return toDayExerciseDto(exercise);
  }

  /**
   * Renombra las demás apariciones del mismo ejercicio en la misma rutina.
   *
   * El historial de progreso se agrupa por NOMBRE (`progress.service.ts`), y un
   * mesociclo repite los mismos ejercicios en cada semana. Corregir un typo en
   * una sola semana parte la serie histórica en dos entradas —una con los datos
   * de antes y otra con los de después— sin ningún aviso.
   *
   * Es OPT-IN y no automático porque cambiar una sola semana también es un uso
   * legítimo: en una progresión, la semana 3 puede pasar de sentadilla a
   * sentadilla frontal a propósito. Propagar siempre rompería eso.
   *
   * El alcance es la rutina, no la base entera: es exactamente el alcance con
   * el que `GET /splits/:id/progress` agrupa.
   */
  private async renombrarEnLaRutina(id: string, nombre: string): Promise<void> {
    const actual = await this.prisma.dayExercise.findUniqueOrThrow({
      where: { id },
      select: {
        name: true,
        day: { select: { microcycle: { select: { splitId: true } } } },
      },
    });
    if (actual.name === nombre) return;

    await this.prisma.dayExercise.updateMany({
      where: {
        name: actual.name,
        ...VIVO,
        day: { microcycle: { splitId: actual.day.microcycle.splitId } },
      },
      data: { name: nombre },
    });
  }

  /** Reorden en bloque de los ejercicios de un día. Ver `reorder.ts`. */
  async reorder(
    user: UserDto,
    dayId: string,
    ids: string[],
  ): Promise<DayExerciseDto[]> {
    await this.access.assertDay(user, dayId, 'write');

    await this.prisma.$transaction(async (tx) => {
      const actuales = await tx.dayExercise.findMany({
        where: { dayId, ...VIVO },
        select: { id: true, order: true },
      });
      await aplicarReorden(actuales, ids, (id, order) =>
        tx.dayExercise.update({ where: { id }, data: { order } }),
      );
    });

    const exercises = await this.prisma.dayExercise.findMany({
      where: { dayId, ...VIVO },
      orderBy: { order: 'asc' },
    });
    return exercises.map(toDayExerciseDto);
  }

  /** Lógico: si se borrara de verdad, se irían las series ya registradas. */
  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertExercise(user, id, 'write');
    await softDeleteExercise(this.prisma, id, new Date());
  }
}
