import { Module } from '@nestjs/common';

import { DaysController } from './days.controller';
import { DaysService } from './days.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { MicrocyclesController } from './microcycles.controller';
import { MicrocyclesService } from './microcycles.service';
import { RoutineAccessService } from './routine-access.service';
import { SplitsController } from './splits.controller';
import { SplitsService } from './splits.service';

/** El árbol de rutinas: Split -> Microcycle -> Day -> DayExercise. */
@Module({
  controllers: [
    SplitsController,
    MicrocyclesController,
    DaysController,
    ExercisesController,
  ],
  providers: [
    RoutineAccessService,
    SplitsService,
    MicrocyclesService,
    DaysService,
    ExercisesService,
  ],
  exports: [RoutineAccessService],
})
export class RoutineModule {}
