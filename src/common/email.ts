import { Transform } from 'class-transformer';

/**
 * Normaliza un email para guardarlo y para buscarlo.
 *
 * Tiene que ser la MISMA función en el alta y en el login: si el alta guarda
 * `Franco@X.com ` y el login busca `franco@x.com`, ese usuario no entra nunca.
 * La unicidad de la columna es sobre el valor guardado tal cual, así que
 * también depende de esto.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/**
 * Normaliza el email ANTES de validarlo.
 *
 * Sin esto `@IsEmail` ve el valor crudo y un `" ana@x.com "` —lo que deja un
 * copiar/pegar— se va en 400 aunque el email sea perfectamente válido.
 * class-transformer corre antes que class-validator, así que acá llega limpio.
 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
