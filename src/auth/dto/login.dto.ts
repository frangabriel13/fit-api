import { IsEmail, IsString, MinLength } from 'class-validator';

import { NormalizeEmail } from '../../common/email';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email inválido' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'la contraseña es obligatoria' })
  password: string;
}
