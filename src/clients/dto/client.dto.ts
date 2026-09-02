import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD, MIN_PASSWORD } from '../../auth/password';
import { NormalizeEmail } from '../../common/email';
import { OptionalDefined, Trim } from '../../common/validators';

/**
 * Alta de un cliente por parte de su entrenador.
 *
 * `role` y `trainerId` NO están acá a propósito: los pone el servidor. Con
 * `whitelist: true` el pipe descarta lo que no esté declarado, así que mandar
 * `{"role": "trainer"}` en el body no escala privilegios, se ignora.
 */
export class CreateClientDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email inválido' })
  @MaxLength(200)
  email: string;

  @Trim()
  @IsString()
  @MinLength(1, { message: 'el nombre es obligatorio' })
  @MaxLength(200)
  name: string;

  /** Provisoria: el cliente la cambia con POST /auth/change-password. */
  @IsString()
  @MinLength(MIN_PASSWORD, {
    message: `la contraseña debe tener al menos ${MIN_PASSWORD} caracteres`,
  })
  @MaxLength(MAX_PASSWORD)
  password: string;
}

/**
 * Corrección de un cliente de la cartera. Todos los campos son opcionales:
 * ausente = no tocar.
 *
 * `password` es el único camino de recuperación que existe hoy: no hay reset
 * por email, así que si un cliente se olvida la suya, su entrenador se la
 * vuelve a poner y queda marcada como provisoria otra vez.
 */
export class UpdateClientDto {
  @NormalizeEmail()
  @OptionalDefined()
  @IsEmail({}, { message: 'email inválido' })
  @MaxLength(200)
  email?: string;

  @Trim()
  @OptionalDefined()
  @IsString()
  @MinLength(1, { message: 'el nombre no puede quedar vacío' })
  @MaxLength(200)
  name?: string;

  @OptionalDefined()
  @IsString()
  @MinLength(MIN_PASSWORD, {
    message: `la contraseña debe tener al menos ${MIN_PASSWORD} caracteres`,
  })
  @MaxLength(MAX_PASSWORD)
  password?: string;
}
