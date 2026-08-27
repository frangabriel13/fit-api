import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

import { OptionalDefined } from '../../common/validators';

export class CreateMicrocycleDto {
  @IsString()
  @MinLength(1, { message: 'el nombre es obligatorio' })
  @MaxLength(200)
  name: string;

  @IsInt({ message: 'order debe ser un entero' })
  order: number;
}

export class UpdateMicrocycleDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1, { message: 'el nombre no puede quedar vacío' })
  @MaxLength(200)
  name?: string;

  @OptionalDefined()
  @IsInt({ message: 'order debe ser un entero' })
  order?: number;
}
