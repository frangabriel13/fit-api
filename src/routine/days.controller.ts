import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DaysService } from './days.service';
import { CreateDayDto, UpdateDayDto } from './dto/day.dto';
import { ReorderDto } from './dto/reorder.dto';
import type { DayDto } from './routine.types';

@Controller()
export class DaysController {
  constructor(private readonly days: DaysService) {}

  @Post('microcycles/:microcycleId/days')
  create(
    @CurrentUser() user: UserDto,
    @Param('microcycleId', ParseUUIDPipe) microcycleId: string,
    @Body() dto: CreateDayDto,
  ): Promise<DayDto> {
    return this.days.create(user, microcycleId, dto);
  }

  /**
   * EXTENSIÓN: reorden en bloque. `ids` es la lista completa de hermanos
   * vivos en el orden deseado, y se aplica en una transacción. Reemplaza a
   * los N `PATCH { order }` sueltos, que podían quedar a medio aplicar.
   */
  @Put('microcycles/:microcycleId/days/order')
  reorder(
    @CurrentUser() user: UserDto,
    @Param('microcycleId', ParseUUIDPipe) microcycleId: string,
    @Body() dto: ReorderDto,
  ): Promise<DayDto[]> {
    return this.days.reorder(user, microcycleId, dto.ids);
  }

  @Patch('days/:id')
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDayDto,
  ): Promise<DayDto> {
    return this.days.update(user, id, dto);
  }

  @Delete('days/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.days.remove(user, id);
  }
}
