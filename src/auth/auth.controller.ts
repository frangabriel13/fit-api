import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { AuthService } from './auth.service';
import type { LoginResponseDto, UserDto } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
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
}
