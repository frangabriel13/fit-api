import { Transform } from 'class-transformer';
import {
  ValidateIf,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

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

/**
 * Igual que `@ArrayMaxSize`, pero se calla cuando el valor ni siquiera es un
 * array: de eso ya se queja `@IsArray`.
 *
 * `arrayMaxSize` de class-validator devuelve false ante cualquier cosa que no
 * sea un array, así que con un body mal formado fallaban los dos validadores y
 * el mensaje del tope podía salir primero: mandaba a buscar un problema de
 * cantidad cuando lo que estaba mal era la forma. `@ValidateIf` no sirve acá
 * porque saltea TODA la propiedad, incluido el `@IsArray`.
 */
export const MaxItems = (max: number, options?: ValidationOptions) =>
  function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'maxItems',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options,
      validator: {
        validate: (value: unknown): boolean =>
          !Array.isArray(value) || value.length <= max,
      },
    });
  };
