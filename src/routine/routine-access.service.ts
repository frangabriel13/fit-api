import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export type AccessLevel = 'read' | 'write';

/**
 * Quién puede tocar qué dentro del árbol de rutinas.
 *
 * Reglas (según lo acordado: el entrenador arma la rutina para un cliente y
 * puede todo sobre los datos de su cartera):
 *
 *   - el entrenador autor de la rutina        -> lectura y escritura
 *   - el entrenador del cliente asignado      -> lectura y escritura
 *   - el cliente con la rutina asignada       -> solo lectura
 *   - cualquier otro                          -> 403
 *
 * Recurso inexistente -> 404. Recurso que existe pero no es tuyo -> 403,
 * nunca 401: un 401 le borraría la sesión a alguien que sí está logueado.
 */
@Injectable()
export class RoutineAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valida el acceso a un split y devuelve su id. */
  async assertSplit(
    user: UserDto,
    splitId: string,
    need: AccessLevel,
  ): Promise<string> {
    const split = await this.prisma.split.findUnique({
      where: { id: splitId },
      select: {
        id: true,
        ownerId: true,
        assignments: {
          select: {
            isActive: true,
            clientId: true,
            trainerId: true,
            client: { select: { trainerId: true } },
          },
        },
      },
    });

    if (!split) throw new NotFoundException('Rutina no encontrada');

    if (split.ownerId === user.id) return split.id;

    if (user.role === UserRole.trainer) {
      const suya = split.assignments.some(
        (a) => a.trainerId === user.id || a.client.trainerId === user.id,
      );
      if (suya) return split.id;
    }

    if (user.role === UserRole.client) {
      const asignada = split.assignments.some(
        (a) => a.clientId === user.id && a.isActive,
      );
      // El cliente ve su rutina pero no la edita: la arma el entrenador.
      if (asignada && need === 'read') return split.id;
      if (asignada) {
        throw new ForbiddenException(
          'Solo tu entrenador puede editar la rutina',
        );
      }
    }

    throw new ForbiddenException('Sin permiso para esta rutina');
  }

  async assertMicrocycle(
    user: UserDto,
    microcycleId: string,
    need: AccessLevel,
  ): Promise<string> {
    const micro = await this.prisma.microcycle.findUnique({
      where: { id: microcycleId },
      select: { id: true, splitId: true },
    });
    if (!micro) throw new NotFoundException('Microciclo no encontrado');
    await this.assertSplit(user, micro.splitId, need);
    return micro.id;
  }

  async assertDay(
    user: UserDto,
    dayId: string,
    need: AccessLevel,
  ): Promise<string> {
    const day = await this.prisma.day.findUnique({
      where: { id: dayId },
      select: { id: true, microcycle: { select: { splitId: true } } },
    });
    if (!day) throw new NotFoundException('Día no encontrado');
    await this.assertSplit(user, day.microcycle.splitId, need);
    return day.id;
  }

  async assertExercise(
    user: UserDto,
    exerciseId: string,
    need: AccessLevel,
  ): Promise<string> {
    const exercise = await this.prisma.dayExercise.findUnique({
      where: { id: exerciseId },
      select: {
        id: true,
        day: { select: { microcycle: { select: { splitId: true } } } },
      },
    });
    if (!exercise) throw new NotFoundException('Ejercicio no encontrado');
    await this.assertSplit(user, exercise.day.microcycle.splitId, need);
    return exercise.id;
  }

  /** Un entrenador solo puede asignar rutinas a clientes de su cartera. */
  async assertIsMyClient(trainer: UserDto, clientId: string): Promise<void> {
    if (trainer.role !== UserRole.trainer) {
      throw new ForbiddenException('Solo un entrenador puede asignar rutinas');
    }
    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: { trainerId: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (client.trainerId !== trainer.id) {
      throw new ForbiddenException('Ese cliente no es de tu cartera');
    }
  }
}
