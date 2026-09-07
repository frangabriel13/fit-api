import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './common/bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Toda la configuración vive en `configureApp`, compartida con los tests e2e.
  configureApp(app);

  // Cierra las conexiones antes de morir: sin esto, un redeploy corta requests
  // a la mitad y deja conexiones de Postgres colgadas.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
