import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'email inválido' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'la contraseña es obligatoria' })
  password: string;
}
