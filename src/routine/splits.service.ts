import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSplitDto, UpdateSplitDto } from './dto/split.dto';
import { RoutineAccessService } from './routine-access.service';
import { SPLIT_TREE_INCLUDE, toSplitDto } from './routine.mapper';
import { SplitDto } from './routine.types';

@Injectable()
export class SplitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RoutineAccessService,
  ) {}

  /**
   * Sin `clientId`: un entrenador ve las rutinas que armó, un cliente las que
   * tiene asignadas. Con `clientId` (extensión al contrato): las de ese
   * cliente, si es de tu cartera.
   */
  async findAll(user: UserDto, clientId?: string): Promise<SplitDto[]> {
    if (clientId) {
      await this.access.assertIsMyClient(user, clientId);
      const splits = await this.prisma.split.findMany({
        where: { assignments: { some: { clientId, isActive: true } } },
        include: SPLIT_TREE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      return splits.map(toSplitDto);
    }

    const where =
      user.role === UserRole.trainer
        ? { ownerId: user.id }
        : { assignments: { some: { clientId: user.id, isActive: true } } };

    const splits = await this.prisma.split.findMany({
      where,
      include: SPLIT_TREE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return splits.map(toSplitDto);
  }

  async findOne(user: UserDto, id: string): Promise<SplitDto> {
    await this.access.assertSplit(user, id, 'read');
    // Ya validado arriba: el split existe y es accesible.
    const split = await this.prisma.split.findUniqueOrThrow({
      where: { id },
      include: SPLIT_TREE_INCLUDE,
    });
    return toSplitDto(split);
  }

  async create(user: UserDto, dto: CreateSplitDto): Promise<SplitDto> {
    const { clientId, ...data } = dto;
    if (clientId) await this.access.assertIsMyClient(user, clientId);

    const split = await this.prisma.split.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        ownerId: user.id,
        // Si vino un cliente, la rutina nace ya asignada.
        ...(clientId
          ? { assignments: { create: { clientId, trainerId: user.id } } }
          : {}),
      },
      include: SPLIT_TREE_INCLUDE,
    });
    return toSplitDto(split);
  }

  async update(
    user: UserDto,
    id: string,
    dto: UpdateSplitDto,
  ): Promise<SplitDto> {
    await this.access.assertSplit(user, id, 'write');
    const { clientId, ...rest } = dto;
    if (clientId) await this.access.assertIsMyClient(user, clientId);

    const split = await this.prisma.split.update({
      where: { id },
      data: {
        ...patchData(rest),
        ...(clientId
          ? {
              assignments: {
                upsert: {
                  where: { clientId_splitId: { clientId, splitId: id } },
                  create: { clientId, trainerId: user.id },
                  update: { isActive: true },
                },
              },
            }
          : {}),
      },
      include: SPLIT_TREE_INCLUDE,
    });
    return toSplitDto(split);
  }

  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertSplit(user, id, 'write');
    await this.prisma.split.delete({ where: { id } });
  }
}
