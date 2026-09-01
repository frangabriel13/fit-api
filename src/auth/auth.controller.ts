import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { AuthService } from './auth.service';
import type { LoginResponseDto, UserDto } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

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

  @Get('me')
  me(@CurrentUser() user: UserDto): UserDto {
    return user;
  }

  /**
   * EXTENSIÓN al contrato. Cualquier usuario autenticado cambia LA SUYA; no
   * hay forma de tocar la de otro por acá.
   *
   * Los tokens ya emitidos siguen siendo válidos después del cambio: el JWT es
   * stateless y no hay lista de revocación. Está anotado como pendiente.
   */
  @Post('change-password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: UserDto,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(user.id, dto);
  }
}
