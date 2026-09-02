import { IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from './pagination.dto';

/**
 * Filtro "¿de quién son estos datos?". El nombre canónico es `userId`.
 *
 * `clientId` se acepta como alias en TODOS los endpoints que filtran por
 * usuario. Antes cada endpoint usaba uno de los dos nombres y el que no
 * correspondía lo descartaba en silencio el `whitelist` del pipe: pedir las
 * sesiones de un cliente con `clientId` devolvía 200 con las sesiones propias.
 * Un error de nombre daba datos equivocados sin ningún aviso.
 *
 * Las dos clases repiten los campos a propósito: TypeScript no tiene herencia
 * múltiple y prefiero seis líneas duplicadas antes que un mixin.
 */
export class TargetUserQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Alias de `userId`. */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

/** Igual que `TargetUserQueryDto`, para los listados que además paginan. */
export class TargetUserPageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Alias de `userId`. */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export const targetUserId = (
  query: TargetUserQueryDto | TargetUserPageQueryDto,
): string | undefined => query.userId ?? query.clientId;
