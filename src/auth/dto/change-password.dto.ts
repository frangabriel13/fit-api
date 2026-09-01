import { IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD, MIN_PASSWORD } from '../password';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'la contraseña actual es obligatoria' })
  currentPassword: string;

  @IsString()
  @MinLength(MIN_PASSWORD, {
    message: `la contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres`,
  })
  @MaxLength(MAX_PASSWORD)
  newPassword: string;
}
