import { IsOptional, IsUUID } from 'class-validator';

/** Sin `userId` es el progreso de quien llama; con él, el de ese cliente. */
export class ProgressQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
