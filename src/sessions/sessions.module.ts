import { Module } from '@nestjs/common';

import { SessionsAccessService } from './sessions-access.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/** Sesiones de entrenamiento y registro de series. */
@Module({
  controllers: [SessionsController],
  providers: [SessionsService, SessionsAccessService],
  exports: [SessionsAccessService],
})
export class SessionsModule {}
