import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * El contrato manda body vacío `{}`. `notes` es una extensión tolerada: si no
 * viene, la sesión nace sin notas.
 */
export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/**
 * EXTENSIÓN: `GET /days/:dayId/sessions` no recibe parámetros en el contrato.
 * Sin el filtro, un entrenador no puede ver el historial de su cliente.
 * Sin el parámetro devuelve las sesiones de quien llama, como el contrato.
 */
export class ListSessionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
