import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OptionalDefined } from '../../common/validators';

export class CreateDayDto {
  @IsString()
  @MinLength(1, { message: 'el nombre es obligatorio' })
  @MaxLength(200)
  name: string;

  @IsInt({ message: 'order debe ser un entero' })
  order: number;

  /** EXTENSIÓN: existe en la base heredada, no en `DayPayload`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  focus?: string | null;
}

export class UpdateDayDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1, { message: 'el nombre no puede quedar vacío' })
  @MaxLength(200)
  name?: string;

  @OptionalDefined()
  @IsInt({ message: 'order debe ser un entero' })
  order?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  focus?: string | null;
}
