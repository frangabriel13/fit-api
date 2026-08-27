import { UserRole } from '@prisma/client';

/** `User` tal como lo espera el frontend (types/api.ts). Sin `password`. */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
