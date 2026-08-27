import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import { OptionalDefined } from '../../common/validators';

/**
 * Una serie del lote de `PUT /sessions/:id/set-logs`.
 *
 * OJO con la semántica: el frontend manda el ESTADO COMPLETO de cada serie en
 * cada llamada (`hooks/use-set-log-grid.ts` → `buildPayload` recorre toda la
 * grilla), así que un campo numérico ausente significa "sin dato" y se guarda
 * NULL. Es la regla OPUESTA a la de un PATCH, donde ausente = no tocar.
 */
export class SetLogUpsertDto {
  @IsUUID()
  dayExerciseId: string;

  @IsInt()
  @Min(1, { message: 'setNumber arranca en 1' })
  setNumber: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualRir?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number | null;

  @IsBoolean()
  completed: boolean;

  /** EXTENSIÓN: serie omitida. */
  @OptionalDefined()
  @IsBoolean()
  skipped?: boolean;
}

export class UpsertSetLogsDto {
  @IsArray()
  @ArrayMaxSize(500, { message: 'demasiadas series en un solo lote' })
  @ValidateNested({ each: true })
  @Type(() => SetLogUpsertDto)
  setLogs: SetLogUpsertDto[];
}

/**
 * `PATCH /set-logs/:id`: edición puntual. Acá sí vale la regla estándar de
 * PATCH — campo ausente = no tocar, `null` explícito = borrar el dato.
 */
export class SetLogPatchDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualRir?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number | null;

  @OptionalDefined()
  @IsBoolean()
  completed?: boolean;

  @OptionalDefined()
  @IsBoolean()
  skipped?: boolean;
}
