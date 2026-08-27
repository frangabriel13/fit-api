import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Quién puede ver o tocar las sesiones de entrenamiento.
 *
 *   - el dueño de la sesión           -> lectura y escritura
 *   - el entrenador del dueño         -> lectura y escritura (acordado: el
 *                                        entrenador puede todo sobre su cartera)
 *   - cualquier otro                  -> 403
 *
 * A diferencia del árbol de rutinas, acá el cliente SÍ escribe: registrar las
 * series de su propio entrenamiento es exactamente lo que hace.
 */
@Injectable()
export class SessionsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valida acceso a una sesión y devuelve su `dayId`. */
  async assertSession(user: UserDto, sessionId: string): Promise<string> {
    const session = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      select: {
        dayId: true,
        userId: true,
        user: { select: { trainerId: true } },
      },
    });

    if (!session) throw new NotFoundException('Sesión no encontrada');
    if (session.userId === user.id) return session.dayId;

    if (user.role === UserRole.trainer && session.user.trainerId === user.id) {
      return session.dayId;
    }

    throw new ForbiddenException('Sin permiso para esta sesión');
  }

  /**
   * Valida que se pueda usar ese día: tiene que existir y la rutina que lo
   * contiene tiene que ser accesible para el usuario.
   *
   * `incluirBorrados` distingue los dos usos: para LEER historial se aceptan
   * días ya borrados de la rutina (si no, borrar un día escondería las
   * sesiones que se entrenaron con él, que es lo que el soft delete vino a
   * evitar); para EMPEZAR una sesión nueva, no.
   */
  async assertDay(
    user: UserDto,
    dayId: string,
    { incluirBorrados = false }: { incluirBorrados?: boolean } = {},
  ): Promise<void> {
    const day = await this.prisma.day.findFirst({
      where: { id: dayId, ...(incluirBorrados ? {} : { deletedAt: null }) },
      select: {
        microcycle: {
          select: {
            split: {
              select: {
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
            },
          },
        },
      },
    });

    if (!day) throw new NotFoundException('Día no encontrado');
    const split = day.microcycle.split;

    if (split.ownerId === user.id) return;

    if (user.role === UserRole.trainer) {
      const suya = split.assignments.some(
        (a) => a.trainerId === user.id || a.client.trainerId === user.id,
      );
      if (suya) return;
    }

    const asignada = split.assignments.some(
      (a) => a.clientId === user.id && a.isActive,
    );
    if (asignada) return;

    throw new ForbiddenException('Sin permiso para esta rutina');
  }

  /** Un entrenador solo puede mirar el historial de su propia cartera. */
  async assertCanSeeUser(viewer: UserDto, targetId: string): Promise<void> {
    if (viewer.id === targetId) return;

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { trainerId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    if (viewer.role !== UserRole.trainer || target.trainerId !== viewer.id) {
      throw new ForbiddenException('Sin permiso para ver ese historial');
    }
  }
}
