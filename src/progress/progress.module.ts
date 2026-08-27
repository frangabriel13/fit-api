import { Module } from '@nestjs/common';

import { RoutineModule } from '../routine/routine.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/** Progreso del macrociclo: posición en semanas e historial por ejercicio. */
@Module({
  imports: [RoutineModule, SessionsModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
