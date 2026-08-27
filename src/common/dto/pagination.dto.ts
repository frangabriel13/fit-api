import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Paginación opcional para los listados.
 *
 * Sin parámetros el endpoint devuelve todo, igual que antes: el contrato dice
 * que las respuestas son arrays pelados, así que no se les puede poner un
 * envoltorio `{ items, total }` sin romper el frontend, y un límite por
 * default recortaría datos en silencio a un cliente que no lo pidió.
 *
 * El tope de `limit` es para acotar el trabajo cuando alguien sí lo pide.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1)
  @Max(200, { message: 'limit no puede pasar de 200' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset debe ser un entero' })
  @Min(0)
  offset?: number;
}

/** Traduce la paginación a los argumentos de Prisma. */
export const paginar = ({ limit, offset }: PaginationQueryDto) => ({
  ...(limit !== undefined ? { take: limit } : {}),
  ...(offset !== undefined ? { skip: offset } : {}),
});
