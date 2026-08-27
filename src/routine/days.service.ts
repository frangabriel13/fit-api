import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDayDto, UpdateDayDto } from './dto/day.dto';
import { RoutineAccessService } from './routine-access.service';
import { VIVO, toDayDto } from './routine.mapper';
import { softDeleteDay } from './soft-delete';
import { DayDto } from './routine.types';

const WITH_EXERCISES = {
  exercises: { where: VIVO, orderBy: { order: 'asc' } },
} satisfies Prisma.DayInclude;

@Injectable()
export class DaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RoutineAccessService,
  ) {}

  async create(
    user: UserDto,
    microcycleId: string,
    dto: CreateDayDto,
  ): Promise<DayDto> {
    await this.access.assertMicrocycle(user, microcycleId, 'write');
    const day = await this.prisma.day.create({
      data: {
        name: dto.name,
        order: dto.order,
        focus: dto.focus ?? null,
        microcycleId,
      },
      include: WITH_EXERCISES,
    });
    return toDayDto(day);
  }

  async update(user: UserDto, id: string, dto: UpdateDayDto): Promise<DayDto> {
    await this.access.assertDay(user, id, 'write');
    const day = await this.prisma.day.update({
      where: { id },
      data: patchData(dto),
      include: WITH_EXERCISES,
    });
    return toDayDto(day);
  }

  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertDay(user, id, 'write');
    const at = new Date();
    await this.prisma.$transaction((tx) => softDeleteDay(tx, id, at));
  }
}
