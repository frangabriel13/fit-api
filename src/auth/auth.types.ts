import { UserRole } from '@prisma/client';

/** `User` tal como lo espera el frontend (types/api.ts). Sin `password`. */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /**
   * EXTENSIÓN: la contraseña la eligió otro (alta por el entrenador o por
   * CLI). El front lo usa para empujar al usuario a cambiarla. No puede vivir
   * en el navegador: sería por dispositivo y no por cuenta.
   */
  mustChangePassword: boolean;
}

/** `LoginResponse` del contrato. */
export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
}

/** Lo que viaja dentro del JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
