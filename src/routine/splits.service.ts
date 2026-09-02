import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { PaginationQueryDto, paginar } from '../common/dto/pagination.dto';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSplitDto, UpdateSplitDto } from './dto/split.dto';
import { RoutineAccessService } from './routine-access.service';
import { SPLIT_TREE_INCLUDE, VIVO, toSplitDto } from './routine.mapper';
import { softDeleteSplit } from './soft-delete';
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
  async findAll(
    user: UserDto,
    clientId?: string,
    pagina: PaginationQueryDto = {},
  ): Promise<SplitDto[]> {
    if (clientId) {
      await this.access.assertIsMyClient(user, clientId);
      const splits = await this.prisma.split.findMany({
        where: {
          ...VIVO,
          assignments: { some: { clientId, isActive: true } },
        },
        include: SPLIT_TREE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...paginar(pagina),
      });
      return splits.map(toSplitDto);
    }

    const where =
      user.role === UserRole.trainer
        ? { ...VIVO, ownerId: user.id }
        : {
            ...VIVO,
            assignments: { some: { clientId: user.id, isActive: true } },
          };

    const splits = await this.prisma.split.findMany({
      where,
      include: SPLIT_TREE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      ...paginar(pagina),
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
    if (clientId) {
      await this.access.assertIsMyClient(user, clientId);
      await this.assertSinRutina(clientId);
    }

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
    if (clientId) {
      await this.access.assertIsMyClient(user, clientId);
      await this.assertSinRutina(clientId, id);
    }

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

  /**
   * Desasigna la rutina de un cliente.
   *
   * La asignación se desactiva en vez de borrarse: queda registro de que esa
   * persona entrenó con esta rutina, que es lo que le da sentido a sus
   * sesiones viejas. Volver a asignarla la reactiva.
   */
  async unassign(
    user: UserDto,
    splitId: string,
    clientId: string,
  ): Promise<void> {
    await this.access.assertSplit(user, splitId, 'write');
    await this.access.assertIsMyClient(user, clientId);

    const { count } = await this.prisma.splitAssignment.updateMany({
      where: { splitId, clientId, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) {
      throw new NotFoundException('Ese cliente no tiene asignada esta rutina');
    }
  }

  /**
   * Un cliente tiene UNA rutina activa: es la regla de producto que el
   * frontend ya asume (toma la primera de la lista).
   *
   * Sin este chequeo, asignarle una segunda no fallaba y la rutina con la que
   * venía entrenando simplemente dejaba de verse —seguía en la base, pero sin
   * ningún camino para recuperarla desde la app—. Preferimos el 409 antes que
   * desasignar sola la anterior: cambiarle la rutina a alguien tiene que ser
   * un acto explícito, no el efecto secundario de un clic.
   *
   * Las rutinas borradas no cuentan: no bloquean una asignación nueva.
   */
  private async assertSinRutina(
    clientId: string,
    exceptoSplitId?: string,
  ): Promise<void> {
    const otra = await this.prisma.splitAssignment.findFirst({
      where: {
        clientId,
        isActive: true,
        split: VIVO,
        ...(exceptoSplitId ? { splitId: { not: exceptoSplitId } } : {}),
      },
      select: { splitId: true, split: { select: { name: true } } },
    });

    if (otra) {
      throw new ConflictException(
        `Ese cliente ya tiene una rutina asignada ("${otra.split.name}"). ` +
          `Desasignala primero: DELETE /splits/${otra.splitId}/assignments/${clientId}`,
      );
    }
  }

  /** Borrado lógico: ver `soft-delete.ts` para el porqué. */
  async remove(user: UserDto, id: string): Promise<void> {
    await this.access.assertSplit(user, id, 'write');
    const at = new Date();
    await this.prisma.$transaction((tx) => softDeleteSplit(tx, id, at));
  }
}
