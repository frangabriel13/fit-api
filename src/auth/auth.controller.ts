import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { AuthService } from './auth.service';
import type { LoginResponseDto, TokensDto, UserDto } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto, RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Credenciales inválidas → 401 (lo pide el contrato). */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(dto);
  }

  /**
   * EXTENSIÓN: canjea el refresh token por un par nuevo. Es público porque el
   * access token justamente puede estar vencido — el refresh ES la credencial.
   *
   * Rota: el token usado queda revocado. Reusar uno ya gastado cierra todas las
   * sesiones del usuario, porque es la señal de que alguien copió la cadena.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<TokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  /**
   * EXTENSIÓN: cierra la sesión de ESTE dispositivo revocando su refresh token.
   *
   * Siempre 204, incluso si el token no vale o no viene: cerrar sesión no puede
   * fallar. El access token que ya tenga el cliente sigue vivo hasta vencer —
   * es stateless—; para matarlo ya hay que usar `logout-all`.
   */
  @Post('logout')
  @HttpCode(204)
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  /**
   * EXTENSIÓN: cierra TODAS las sesiones del usuario, incluida esta. Es lo que
   * hay que tocar si a alguien le robaron el token.
   */
  @Post('logout-all')
  @HttpCode(204)
  logoutAll(@CurrentUser() user: UserDto): Promise<void> {
    return this.auth.logoutAll(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: UserDto): UserDto {
    return user;
  }

  /**
   * EXTENSIÓN al contrato. Cualquier usuario autenticado cambia LA SUYA; no
   * hay forma de tocar la de otro por acá.
   *
   * CAMBIO: antes devolvía 204 y los tokens ya emitidos seguían valiendo. Ahora
   * el cambio cierra todas las sesiones y devuelve 200 con un par nuevo, para
   * que el dispositivo que hizo el cambio siga adentro. El front tiene que
   * guardar el `accessToken` que vuelve; si lo ignora, el siguiente request le
   * da 401 y termina en el login.
   */
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: UserDto,
    @Body() dto: ChangePasswordDto,
  ): Promise<TokensDto> {
    return this.auth.changePassword(user.id, dto);
  }
}
