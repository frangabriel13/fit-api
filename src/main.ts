import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { buildValidationPipe } from './common/validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // El front corre en otro puerto (3002 por defecto). Sin cookies: el token
  // viaja en el header Authorization, así que no hace falta credentials.
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? true,
    credentials: false,
  });

  app.useGlobalPipes(buildValidationPipe());

  // OJO: nada de interceptores globales de respuesta. El front hace
  // `response.data` directo — cualquier envoltorio `{ data: ... }` lo rompe.

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
