import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateSessionDto, ListSessionsQueryDto } from './dto/session.dto';
import { SetLogPatchDto, UpsertSetLogsDto } from './dto/set-log.dto';
import { SessionsService } from './sessions.service';
import type { SetLogDto, WorkoutSessionDto } from './sessions.types';

@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('days/:dayId/sessions')
  findByDay(
    @CurrentUser() user: UserDto,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Query() query: ListSessionsQueryDto,
  ): Promise<WorkoutSessionDto[]> {
    return this.sessions.findByDay(user, dayId, query.userId, query);
  }

  @Get('sessions/:id')
  findOne(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkoutSessionDto> {
    return this.sessions.findOne(user, id);
  }

  /** Se llama con body vacío `{}`. El backend pone el `performedAt`. */
  @Post('days/:dayId/sessions')
  create(
    @CurrentUser() user: UserDto,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<WorkoutSessionDto> {
    return this.sessions.createForDay(user, dayId, dto);
  }

  /** Upsert en lote. Devuelve la sesión completa con todos sus set-logs. */
  @Put('sessions/:id/set-logs')
  upsertSetLogs(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertSetLogsDto,
  ): Promise<WorkoutSessionDto> {
    return this.sessions.upsertSetLogs(user, id, dto);
  }

  @Patch('set-logs/:id')
  patchSetLog(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLogPatchDto,
  ): Promise<SetLogDto> {
    return this.sessions.patchSetLog(user, id, dto);
  }

  /** EXTENSIÓN: el contrato no lo tiene, pero sin esto no se puede borrar. */
  @Delete('set-logs/:id')
  @HttpCode(204)
  removeSetLog(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.sessions.removeSetLog(user, id);
  }
}
