import * as argon2 from 'argon2';

/**
 * Hashing de contraseñas, fuera del servicio para que el alta de clientes
 * pueda usarlo sin arrastrar `AuthModule` entero como dependencia.
 *
 * argon2id es el algoritmo con el que ya estaban hasheadas las contraseñas de
 * la base heredada: cambiarlo invalidaría todos los logins existentes.
 */
export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id });

/** Un hash corrupto en la base no debe tumbar el request: es login fallido. */
export const verifyPassword = async (
  hash: string,
  plain: string,
): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
};

/** Mínimo compartido por el alta y por el cambio de contraseña. */
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
