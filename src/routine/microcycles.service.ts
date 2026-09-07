import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMicrocycleDto, UpdateMicrocycleDto } from './dto/microcycle.dto';
import { RoutineAccessService } from './routine-access.service';
import { aplicarReorden, conOrdenUnico } from './reorder';
import { VIVO, toMicrocycleDto } from './routine.mapper';
import { softDeleteMicrocycle } from './soft-delete';
import { MicrocycleDto } from './routine.types';

const WITH_DAYS = {
  days: {
    where: VIVO,
    orderBy: { order: 'asc' },
    include: { exercises: { where: VIVO, orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.MicrocycleInclude;

@Injectable()
export class MicrocyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RoutineAccessService,
  ) {}

  async create(
    user: UserDto,
    splitId: string,
    dto: CreateMicrocycleDto,
  ): Promise<MicrocycleDto> {
    await this.access.assertSplit(user, splitId, 'write');
    const micro = await conOrdenUnico(() =>
      this.prisma.microcycle.create({
        data: { ...dto, splitId },
        include: WITH_DAYS,
      }),
    );
    return toMicrocycleDto(micro);
  }

  async update(
    user: UserDto,
    id: string,
    dto: UpdateMicrocycleDto,
  ): Promise<MicrocycleDto> {
    await this.access.assertMicrocycle(user, id, 'write');
    const micro = await conOrdenUnico(() =>
      this.prisma.microcycle.update({
        where: { id },
        data: patchData(dto),
        include: WITH_DAYS,
      }),
    );
    return toMicrocycleDto(micro);
  }

  /** Reorden en bloque de las semanas de una rutina. Ver `reorder.ts`. */
  async reorder(
    user: UserDto,
    splitId: string,
    ids: string[],
  ): Promise<MicrocycleDto[]> {
    await this.access.assertSplit(user, splitId, 'write');

    await this.prisma.$transaction(async (tx) => {
      const actuales = await tx.microcycle.findMany({
        where: { splitId, ...VIVO },
        select: { id: true, order: true },
      });
      await aplicarReorden(actuales, ids, (id, order) =>
        tx.microcycle.update({ where: { id }, data: { order } }),
      );
    });

    const micros = await this.prisma.microcycle.findMany({
      where: { splitId, ...VIVO },
      orderBy: { order: 'asc' },
      include: WITH_DAYS,
    });
    return micros.map(toMicrocycleDto);
  }

  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertMicrocycle(user, id, 'write');
    const at = new Date();
    await this.prisma.$transaction((tx) => softDeleteMicrocycle(tx, id, at));
  }
}
