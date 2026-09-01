import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';

/**
 * Marca un campo como opcional en un PATCH, pero SIN aceptar `null`.
 *
 * `@IsOptional()` de class-validator saltea la validación tanto con
 * `undefined` como con `null`, así que un `{"name": null}` pasaría de largo y
 * reventaría contra la columna NOT NULL con un 500. Con esto valida cuando el
 * campo viene —null incluido— y solo lo ignora si está ausente.
 *
 * Para campos que SÍ son nulleables (description, notes...) va `@IsOptional()`,
 * porque ahí `null` es un valor legítimo que borra el dato.
 */
export const OptionalDefined = () =>
  ValidateIf((_object: unknown, value: unknown) => value !== undefined);

/**
 * Recorta los espacios antes de validar, para que un `"   "` no pase el
 * `@MinLength(1)` y termine guardado como nombre vacío.
 */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
