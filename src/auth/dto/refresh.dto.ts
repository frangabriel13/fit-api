import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(1, { message: 'refreshToken es obligatorio' })
  @MaxLength(200)
  refreshToken: string;
}

/**
 * En el logout el refresh token es opcional a propósito: un cliente que solo
 * tenga el access token igual tiene que poder cerrar sesión sin comerse un 400.
 */
export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}
