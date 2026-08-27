import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { OptionalDefined } from '../../common/validators';

export class CreateDayExerciseDto {
  @IsString()
  @MinLength(1, { message: 'el nombre es obligatorio' })
  @MaxLength(200)
  name: string;

  @IsInt({ message: 'order debe ser un entero' })
  order: number;

  @IsInt({ message: 'targetSets debe ser un entero' })
  @Min(1, { message: 'targetSets debe ser al menos 1' })
  targetSets: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRestSeconds?: number | null;

  /**
   * El contrato tiene un RIR único; la base guarda un rango. Al escribir, un
   * `targetRir` suelto fija min y max al mismo valor.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  targetRir?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  // --- EXTENSIONES: objetivos como rango y superseries. No están en
  // `DayExercisePayload` pero sí en la base, y las necesitan las pantallas
  // nuevas (/rutina, /progreso).
  @IsOptional()
  @IsInt()
  @Min(0)
  targetRepsMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRepsMax?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRirMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRirMax?: number | null;

  @OptionalDefined()
  @IsBoolean()
  toFailure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supersetGroup?: string | null;
}

export class UpdateDayExerciseDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1, { message: 'el nombre no puede quedar vacío' })
  @MaxLength(200)
  name?: string;

  @OptionalDefined()
  @IsInt({ message: 'order debe ser un entero' })
  order?: number;

  @OptionalDefined()
  @IsInt({ message: 'targetSets debe ser un entero' })
  @Min(1, { message: 'targetSets debe ser al menos 1' })
  targetSets?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRestSeconds?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRir?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRepsMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRepsMax?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRirMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetRirMax?: number | null;

  @OptionalDefined()
  @IsBoolean()
  toFailure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supersetGroup?: string | null;
}
