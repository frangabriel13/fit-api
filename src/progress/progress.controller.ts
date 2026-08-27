import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProgressQueryDto } from './dto/progress.dto';
import { ProgressService } from './progress.service';
import type { SplitProgressDto } from './progress.types';

@Controller('splits/:splitId/progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /**
   * Posición en el macrociclo + historial por ejercicio, en una sola llamada.
   *
   * Va junto y no en dos endpoints porque las pantallas usan ambas cosas a la
   * vez: el gráfico de progresión necesita saber cuál es la semana de hoy para
   * distinguirla de las pasadas.
   */
  @Get()
  forSplit(
    @CurrentUser() user: UserDto,
    @Param('splitId', ParseUUIDPipe) splitId: string,
    @Query() query: ProgressQueryDto,
  ): Promise<SplitProgressDto> {
    return this.progress.forSplit(user, splitId, query.userId);
  }
}
