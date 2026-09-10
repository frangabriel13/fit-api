import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessLevel } from '../routine/routine-access.service';

/**
 * Quién puede ver o tocar las sesiones de entrenamiento.
 *
 *   - el dueño de la sesión           -> lectura y escritura
 *   - el entrenador del dueño         -> SOLO lectura
 *   - cualquier otro                  -> 403
 *
 * A diferencia del árbol de rutinas, acá el cliente SÍ escribe: registrar las
 * series de su propio entrenamiento es exactamente lo que hace.
 *
 * Y el entrenador NO. Antes podía todo sobre su cartera, y eso dejaba escribir
 * en nombre de un cliente: `SetLog` no guarda autor, así que una serie cargada
 * por el entrenador es indistinguible de una que cargó quien entrenó, y la
 * progresión la toma como medición del cliente. Lo mismo con cerrarle el día
 * —`completedAt` es la marca de "esto ya es una medición hecha"— y con la nota,
 * que la escribe quien entrenó. Si alguna vez se quiere de verdad, primero hay
 * que decidir quién queda como autor y guardarlo.
 */
@Injectable()
export class SessionsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida acceso a una sesión y devuelve su `dayId`.
   *
   * `need` es obligatorio a propósito: obliga a cada endpoint a declarar si
   * lee o escribe, que es justo la distinción que antes no existía.
   */
  async assertSession(
    user: UserDto,
    sessionId: string,
    need: AccessLevel,
  ): Promise<string> {
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

    const suEntrenador =
      user.role === UserRole.trainer && session.user.trainerId === user.id;

    if (suEntrenador) {
      if (need === 'read') return session.dayId;
      // Mensaje distinto del genérico: acá el problema no es de quién es la
      // sesión, sino que sobre las ajenas solo se puede mirar.
      throw new ForbiddenException(
        'Solo quien entrenó puede modificar esta sesión',
      );
    }

    throw new ForbiddenException('Sin permiso para esta sesión');
  }

  /**
   * Valida que se pueda EMPEZAR una sesión en ese día: tiene que existir, no
   * estar borrado, y la rutina que lo contiene tiene que ser accesible.
   *
   * Para LEER historial no se usa esto sino `assertDayExists`: ahí está el
   * porqué de la diferencia.
   */
  async assertDay(user: UserDto, dayId: string): Promise<void> {
    const day = await this.prisma.day.findFirst({
      where: { id: dayId, deletedAt: null },
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

  /**
   * Para LEER historial alcanza con que el día exista.
   *
   * Quién puede ver esas sesiones lo decide `assertCanSeeUser` —el dueño o su
   * entrenador—, exactamente el mismo criterio que aplica `assertSession` en
   * `GET /sessions/:id`. Antes esto exigía además acceso a la rutina, y esa
   * condición de más tapaba el historial propio: al desasignar a un cliente
   * (`isActive: false`) el listado le respondía 403 sobre sus propias
   * sesiones mientras el detalle se las seguía dando. Desasignar conserva la
   * asignación justamente para no perder ese historial, así que el 403
   * contradecía su motivo de ser.
   *
   * No filtra por `deletedAt` a propósito: un día borrado de la rutina sigue
   * teniendo historial que mostrar.
   */
  async assertDayExists(dayId: string): Promise<void> {
    const day = await this.prisma.day.findUnique({
      where: { id: dayId },
      select: { id: true },
    });
    if (!day) throw new NotFoundException('Día no encontrado');
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
