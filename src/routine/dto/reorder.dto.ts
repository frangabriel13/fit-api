import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * La lista COMPLETA de hermanos vivos, en el orden deseado.
 *
 * Es un reemplazo total y no un delta a propósito: así el pedido es
 * idempotente y no existe un resultado a medio aplicar. El tope es el mismo
 * criterio que el del upsert de series — un cuerpo desmedido es un bug del
 * cliente, no un caso de uso.
 */
export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'ids no puede venir vacío' })
  @ArrayMaxSize(200, { message: 'demasiados ids' })
  @IsUUID('4', { each: true, message: 'cada id debe ser un UUID' })
  ids: string[];
}
