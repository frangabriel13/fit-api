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
import {
  CreateDayExerciseDto,
  UpdateDayExerciseDto,
} from './dto/day-exercise.dto';
import { ReorderDto } from './dto/reorder.dto';
import { ExercisesService } from './exercises.service';
import type { DayExerciseDto } from './routine.types';

/**
 * OJO con el namespace: `/exercises/:id` son ejercicios DE UN DÍA, no un
 * catálogo global. Si algún día hay catálogo, va a necesitar otro prefijo.
 */
@Controller()
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Post('days/:dayId/exercises')
  create(
    @CurrentUser() user: UserDto,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateDayExerciseDto,
  ): Promise<DayExerciseDto> {
    return this.exercises.create(user, dayId, dto);
  }

  /**
   * EXTENSIÓN: reorden en bloque. `ids` es la lista completa de hermanos
   * vivos en el orden deseado, y se aplica en una transacción. Reemplaza a
   * los N `PATCH { order }` sueltos, que podían quedar a medio aplicar.
   */
  @Put('days/:dayId/exercises/order')
  reorder(
    @CurrentUser() user: UserDto,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: ReorderDto,
  ): Promise<DayExerciseDto[]> {
    return this.exercises.reorder(user, dayId, dto.ids);
  }

  @Patch('exercises/:id')
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDayExerciseDto,
  ): Promise<DayExerciseDto> {
    return this.exercises.update(user, id, dto);
  }

  @Delete('exercises/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.exercises.remove(user, id);
  }
}
