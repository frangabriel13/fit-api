import { Injectable } from '@nestjs/common';

import { UserDto } from '../auth/auth.types';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDayExerciseDto,
  UpdateDayExerciseDto,
} from './dto/day-exercise.dto';
import { RoutineAccessService } from './routine-access.service';
import { toDayExerciseDto } from './routine.mapper';
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

    const exercise = await this.prisma.dayExercise.create({
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
    });
    return toDayExerciseDto(exercise);
  }

  async update(
    user: UserDto,
    id: string,
    dto: UpdateDayExerciseDto,
  ): Promise<DayExerciseDto> {
    await this.access.assertExercise(user, id, 'write');

    // `targetRir` no es una columna: se traduce al rango min/max.
    const { targetRir, ...rest } = dto;
    void targetRir;

    const exercise = await this.prisma.dayExercise.update({
      where: { id },
      data: patchData({ ...rest, ...this.rirRange(dto) }),
    });
    return toDayExerciseDto(exercise);
  }

  /** Lógico: si se borrara de verdad, se irían las series ya registradas. */
  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertExercise(user, id, 'write');
    await softDeleteExercise(this.prisma, id, new Date());
  }
}
