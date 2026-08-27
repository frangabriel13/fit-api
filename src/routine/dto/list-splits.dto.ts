import { IsOptional, IsUUID } from 'class-validator';

/**
 * EXTENSIÓN al contrato: `GET /splits` no recibe parámetros.
 *
 * Sin filtro no hay forma de que un entrenador vea la rutina de un cliente
 * puntual. Sin el parámetro el comportamiento es el del contrato original.
 */
export class ListSplitsQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
