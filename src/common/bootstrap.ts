import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { buildValidationPipe } from './validation';

/**
 * Configuración de la app que corre de verdad.
 *
 * Vive acá y no dentro de `main.ts` por el mismo motivo que
 * `buildValidationPipe`: los tests e2e levantan la app a mano, y si esto
 * estuviera en el bootstrap probarían una configuración que no es la que se
 * despliega.
 */
export function configureApp(app: INestApplication): void {
  // Detrás de un proxy (nginx, Cloudflare, un PaaS) la IP del cliente llega en
  // `X-Forwarded-For`. Sin esto el rate limit vería una sola IP —la del
  // proxy— y limitaría a todos juntos.
  //
  // Apagado por defecto A PROPÓSITO: si se confía en la cabecera SIN un proxy
  // adelante, cualquiera se inventa su IP y saltea el rate limit. Se prende
  // solo cuando hay un proxy real, y con la cantidad de saltos que tenga.
  const saltos = process.env.TRUST_PROXY;
  if (saltos) {
    (app as NestExpressApplication).set('trust proxy', Number(saltos) || 1);
  }

  // Cabeceras de seguridad. `crossOriginResourcePolicy` va en 'cross-origin'
  // porque el front corre en otro puerto: el default ('same-origin') le
  // bloquearía las respuestas.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // El front corre en otro puerto (3002 por defecto). Sin cookies: el token
  // viaja en el header Authorization, así que no hace falta credentials.
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? true,
    credentials: false,
  });

  app.useGlobalPipes(buildValidationPipe());

  // OJO: nada de interceptores globales de respuesta. El front hace
  // `response.data` directo — cualquier envoltorio `{ data: ... }` lo rompe.
}
