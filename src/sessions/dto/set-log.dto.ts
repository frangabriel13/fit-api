import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import { MaxItems, OptionalDefined } from '../../common/validators';

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

/** Tope del lote. Es una guarda contra un payload absurdo, no un límite real:
 *  un día de entrenamiento no pasa de unas decenas de series. */
const MAX_LOTE = 500;

export class UpsertSetLogsDto {
  /**
   * Mandar el array pelado en vez de `{ setLogs: [...] }` tiene que decir eso
   * y no otra cosa: ver `MaxItems`.
   */
  @IsArray({ message: 'setLogs tiene que ser un array de series' })
  @MaxItems(MAX_LOTE, {
    message: `demasiadas series en un solo lote (máximo ${MAX_LOTE})`,
  })
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
