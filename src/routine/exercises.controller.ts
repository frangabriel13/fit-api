import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateDayExerciseDto,
  UpdateDayExerciseDto,
} from './dto/day-exercise.dto';
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
