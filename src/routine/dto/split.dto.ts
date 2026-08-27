import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OptionalDefined } from '../../common/validators';

export class CreateSplitDto {
  @IsString()
  @MinLength(1, { message: 'el nombre es obligatorio' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /**
   * EXTENSIÓN al contrato: `SplitPayload` no lo tiene.
   * Si viene, la rutina se crea ya asignada a ese cliente (que debe ser de la
   * cartera de quien llama). Sin esto no hay forma de que un entrenador arme
   * una rutina *para* alguien.
   */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class UpdateSplitDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1, { message: 'el nombre no puede quedar vacío' })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}
