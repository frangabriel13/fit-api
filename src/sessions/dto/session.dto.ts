import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { TargetUserPageQueryDto } from '../../common/dto/target-user.dto';
import { OptionalDefined } from '../../common/validators';

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
export class ListSessionsQueryDto extends TargetUserPageQueryDto {}

/**
 * `PATCH /sessions/:id`: cerrar la sesión y editar sus notas.
 *
 * `completed: true` la cierra con la hora del server; `false` la reabre. Es
 * idempotente: cerrar dos veces conserva la hora del primer cierre, para que
 * un doble clic no corra el dato.
 */
export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @OptionalDefined()
  @IsBoolean()
  completed?: boolean;
}
