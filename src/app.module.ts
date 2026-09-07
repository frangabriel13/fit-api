import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ClientsModule } from './clients/clients.module';
import { throttleGeneral } from './common/throttle';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { RoutineModule } from './routine/routine.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [throttleGeneral()],
      // Los tests e2e hacen cientos de requests desde la misma IP en segundos.
      // El interruptor lo prende solo `throttle.e2e-spec.ts`, que es el que
      // prueba que el límite funciona.
      skipIf: () => process.env.THROTTLE_DISABLED === '1',
    }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    RoutineModule,
    SessionsModule,
    ProgressModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // El orden importa. Primero el rate limit: frenar una ráfaga tiene que
    // costar lo menos posible, y verificar un JWT antes de descartarla sería
    // trabajo regalado. Después autenticar (401) y por último el rol (403).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
