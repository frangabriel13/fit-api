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

/** `LoginResponse` del contrato. `refreshToken` es EXTENSIÓN: aditivo. */
export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
  /**
   * EXTENSIÓN: sesión de larga duración de este dispositivo. El front puede
   * ignorarlo y seguir andando con el access token solo — mientras lo haga,
   * `JWT_EXPIRES_IN` tiene que quedar largo.
   */
  refreshToken: string;
}

/** Lo que devuelve `POST /auth/refresh` y `POST /auth/change-password`. */
export interface TokensDto {
  accessToken: string;
  refreshToken: string;
}

/** Lo que viaja dentro del JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /**
   * Generación del token. Si no coincide con `User.tokenVersion`, el token fue
   * emitido antes de un cierre de sesiones y ya no vale.
   */
  ver: number;
}
