import { seconds, type ThrottlerOptions } from '@nestjs/throttler';

const numero = (v: string | undefined, defecto: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : defecto;
};

/**
 * Tope general por IP y por minuto.
 *
 * Es holgado a propósito: el front dispara ráfagas reales —el upsert de series
 * sale cada 800ms mientras se tipea—, y un límite ajustado cortaría a alguien
 * entrenando. Esto está para frenar un escaneo, no para moderar el uso normal.
 */
export const throttleGeneral = (): ThrottlerOptions => ({
  ttl: seconds(60),
  limit: numero(process.env.THROTTLE_LIMIT, 300),
});

/**
 * Tope de los endpoints de credenciales (`login`, `refresh`).
 *
 * Mucho más bajo porque son los únicos donde adivinar sirve de algo: sin esto,
 * probar contraseñas contra `/auth/login` no tiene ningún costo. Se lee de
 * `process.env` y no de `ConfigService` porque es argumento de un decorador,
 * que se evalúa al cargar la clase.
 */
export const THROTTLE_AUTH = {
  default: {
    ttl: seconds(60),
    limit: numero(process.env.THROTTLE_AUTH_LIMIT, 10),
  },
};
