import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { UserDto } from '../auth/auth.types';
import { dayKey } from '../common/day-key';
import { PaginationQueryDto, paginar } from '../common/dto/pagination.dto';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto, UpdateSessionDto } from './dto/session.dto';
import {
  SetLogPatchDto,
  SetLogUpsertDto,
  UpsertSetLogsDto,
} from './dto/set-log.dto';
import { SessionsAccessService } from './sessions-access.service';
import { SESSION_INCLUDE, toSessionDto, toSetLogDto } from './sessions.mapper';
import { SetLogDto, WorkoutSessionDto } from './sessions.types';

/** Ventana hacia atrás para buscar la sesión de hoy sin escanear el historial. */
const VENTANA_HORAS = 48;

@Injectable()
export class SessionsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SessionsAccessService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('APP_TIMEZONE') ?? 'UTC';
  }

  async findByDay(
    user: UserDto,
    dayId: string,
    userId?: string,
    pagina: PaginationQueryDto = {},
  ): Promise<WorkoutSessionDto[]> {
    // Historial: se lee aunque el día ya no esté en la rutina.
    await this.access.assertDay(user, dayId, { incluirBorrados: true });
    const target = userId ?? user.id;
    if (target !== user.id) await this.access.assertCanSeeUser(user, target);

    const sessions = await this.prisma.workoutSession.findMany({
      where: { dayId, userId: target },
      include: SESSION_INCLUDE,
      orderBy: { performedAt: 'desc' },
      ...paginar(pagina),
    });
    return sessions.map(toSessionDto);
  }

  async findOne(user: UserDto, sessionId: string): Promise<WorkoutSessionDto> {
    await this.access.assertSession(user, sessionId);
    const session = await this.prisma.workoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    return toSessionDto(session);
  }

  /**
   * Cierra o reabre la sesión, y edita sus notas.
   *
   * El cierre es idempotente a propósito: cerrar una sesión ya cerrada
   * conserva la hora del primer cierre. Si la pisara, un doble clic movería el
   * dato sin que nadie se entere.
   */
  async update(
    user: UserDto,
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<WorkoutSessionDto> {
    await this.access.assertSession(user, sessionId);
    const { completed, ...resto } = dto;

    const actual = await this.prisma.workoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { completedAt: true },
    });

    const cierre =
      completed === undefined
        ? {}
        : {
            completedAt: completed ? (actual.completedAt ?? new Date()) : null,
          };

    const session = await this.prisma.workoutSession.update({
      where: { id: sessionId },
      data: { ...patchData(resto), ...cierre },
      include: SESSION_INCLUDE,
    });
    return toSessionDto(session);
  }

  /**
   * Descarta una sesión abierta.
   *
   * Solo mientras siga abierta: una sesión cerrada es historial y borrarla se
   * llevaría sus series por la cascada. Esto existe para el caso real de
   * "abrí la pantalla sin querer y me quedó el día empezado", no para editar
   * el pasado.
   */
  async remove(user: UserDto, sessionId: string): Promise<void> {
    await this.access.assertSession(user, sessionId);

    const { completedAt } = await this.prisma.workoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { completedAt: true },
    });
    if (completedAt) {
      throw new ConflictException(
        'La sesión ya está cerrada: es historial y no se borra',
      );
    }

    await this.prisma.workoutSession.delete({ where: { id: sessionId } });
  }

  /**
   * Idempotente por (día, usuario, día calendario): si ya hay una sesión de
   * hoy la devuelve en vez de crear otra.
   *
   * El front ya se cuida de no llamar dos veces (`useActiveSession`), pero ese
   * guard es por montaje: dos pestañas o un reload en el momento justo
   * crearían sesiones duplicadas. Esto lo cierra del lado del server.
   */
  async createForDay(
    user: UserDto,
    dayId: string,
    dto: CreateSessionDto,
  ): Promise<WorkoutSessionDto> {
    await this.access.assertDay(user, dayId);

    const ahora = new Date();
    const hoy = dayKey(ahora, this.timeZone);
    const desde = new Date(ahora.getTime() - VENTANA_HORAS * 3600_000);

    const recientes = await this.prisma.workoutSession.findMany({
      where: { dayId, userId: user.id, performedAt: { gte: desde } },
      include: SESSION_INCLUDE,
      orderBy: { performedAt: 'desc' },
    });

    const deHoy = recientes.find(
      (s) => dayKey(s.performedAt, this.timeZone) === hoy,
    );
    if (deHoy) return toSessionDto(deHoy);

    const session = await this.prisma.workoutSession.create({
      data: {
        dayId,
        userId: user.id,
        performedAt: ahora,
        notes: dto.notes ?? null,
      },
      include: SESSION_INCLUDE,
    });
    return toSessionDto(session);
  }

  /**
   * UPSERT EN LOTE. Clave natural: (sessionId, dayExerciseId, setNumber).
   *
   * Tres cosas que definen el comportamiento:
   *
   *  1. NO es un reemplazo total: las series que no vengan en el body quedan
   *     intactas.
   *  2. Un campo numérico ausente se guarda NULL, no 0. Es correcto porque el
   *     front manda el estado completo de cada serie en cada llamada.
   *  3. Tiene que aguantar llamadas encimadas: el front lo dispara con
   *     debounce de 800ms mientras se tipea, y al toque al completar una serie.
   */
  async upsertSetLogs(
    user: UserDto,
    sessionId: string,
    dto: UpsertSetLogsDto,
  ): Promise<WorkoutSessionDto> {
    const dayId = await this.access.assertSession(user, sessionId);
    await this.assertExercisesBelongToDay(dayId, dto.setLogs);

    // Orden estable de escritura: dos requests simultáneos toman los locks en
    // el mismo orden y no se traban entre sí.
    const ordenados = [...dto.setLogs].sort(
      (a, b) =>
        a.dayExerciseId.localeCompare(b.dayExerciseId) ||
        a.setNumber - b.setNumber,
    );

    await this.prisma.$transaction(
      ordenados.map((log) => {
        // Ausente -> NULL (ver punto 2 arriba).
        const valores = {
          actualReps: log.actualReps ?? null,
          actualRir: log.actualRir ?? null,
          weight: log.weight ?? null,
          completed: log.completed,
          skipped: log.skipped ?? false,
        };

        return this.prisma.setLog.upsert({
          where: {
            sessionId_dayExerciseId_setNumber: {
              sessionId,
              dayExerciseId: log.dayExerciseId,
              setNumber: log.setNumber,
            },
          },
          create: {
            sessionId,
            dayExerciseId: log.dayExerciseId,
            setNumber: log.setNumber,
            ...valores,
          },
          update: valores,
        });
      }),
    );

    const session = await this.prisma.workoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    return toSessionDto(session);
  }

  /** Edición puntual: acá ausente = no tocar (regla estándar de PATCH). */
  async patchSetLog(
    user: UserDto,
    setLogId: string,
    dto: SetLogPatchDto,
  ): Promise<SetLogDto> {
    await this.assertSetLog(user, setLogId);

    const actualizado = await this.prisma.setLog.update({
      where: { id: setLogId },
      data: patchData(dto),
    });
    return toSetLogDto(actualizado);
  }

  /**
   * EXTENSIÓN al contrato: no existe `DELETE /set-logs/:id`.
   *
   * Sin esto no hay forma de borrar una serie. El upsert del PUT nunca borra,
   * y cuando el usuario vacía una fila el front deja de mandarla
   * (`use-set-log-grid.ts` saltea las filas en blanco), así que la fila vieja
   * queda en la base y reaparece al recargar: el borrado se revierte solo.
   */
  async removeSetLog(user: UserDto, setLogId: string): Promise<void> {
    await this.assertSetLog(user, setLogId);
    await this.prisma.setLog.delete({ where: { id: setLogId } });
  }

  /** Resuelve una serie y valida el acceso a su sesión. */
  private async assertSetLog(user: UserDto, setLogId: string): Promise<void> {
    const log = await this.prisma.setLog.findUnique({
      where: { id: setLogId },
      select: { sessionId: true },
    });
    if (!log) throw new NotFoundException('Serie no encontrada');
    await this.access.assertSession(user, log.sessionId);
  }

  /**
   * Una serie solo puede apuntar a un ejercicio del día de la sesión. Si no,
   * es 400 (payload mal armado), NUNCA 403: no es un problema de permisos.
   */
  private async assertExercisesBelongToDay(
    dayId: string,
    logs: SetLogUpsertDto[],
  ): Promise<void> {
    const pedidos = [...new Set(logs.map((l) => l.dayExerciseId))];
    if (pedidos.length === 0) return;

    const validos = await this.prisma.dayExercise.findMany({
      where: { id: { in: pedidos }, dayId },
      select: { id: true },
    });

    if (validos.length !== pedidos.length) {
      const encontrados = new Set(validos.map((e) => e.id));
      const ajenos = pedidos.filter((id) => !encontrados.has(id));
      throw new BadRequestException(
        `Estos ejercicios no pertenecen al día de la sesión: ${ajenos.join(', ')}`,
      );
    }
  }
}
