import { Injectable } from '@nestjs/common';

import { UserDto } from '../auth/auth.types';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMicrocycleDto, UpdateMicrocycleDto } from './dto/microcycle.dto';
import { RoutineAccessService } from './routine-access.service';
import { toMicrocycleDto } from './routine.mapper';
import { MicrocycleDto } from './routine.types';

const WITH_DAYS = {
  days: {
    orderBy: { order: 'asc' },
    include: { exercises: { orderBy: { order: 'asc' } } },
  },
} as const;

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
    const micro = await this.prisma.microcycle.create({
      data: { ...dto, splitId },
      include: WITH_DAYS,
    });
    return toMicrocycleDto(micro);
  }

  async update(
    user: UserDto,
    id: string,
    dto: UpdateMicrocycleDto,
  ): Promise<MicrocycleDto> {
    await this.access.assertMicrocycle(user, id, 'write');
    const micro = await this.prisma.microcycle.update({
      where: { id },
      data: patchData(dto),
      include: WITH_DAYS,
    });
    return toMicrocycleDto(micro);
  }

  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertMicrocycle(user, id, 'write');
    await this.prisma.microcycle.delete({ where: { id } });
  }
}
