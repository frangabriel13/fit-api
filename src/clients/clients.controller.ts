import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

/**
 * Toda la cartera es del entrenador logueado. Si quien llama no es `trainer`
 * el contrato pide 403, no 401: tiene sesión válida, solo que este recurso no
 * es suyo. Un 401 lo desloguearía.
 */
@Roles(UserRole.trainer)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  findAll(
    @CurrentUser() user: UserDto,
    @Query() pagina: PaginationQueryDto,
  ): Promise<UserDto[]> {
    return this.clients.findForTrainer(user.id, pagina);
  }

  /**
   * EXTENSIÓN al contrato: alta de un cliente en la cartera de quien llama.
   * Sin esto la app no puede incorporar a nadie.
   */
  @Post()
  create(
    @CurrentUser() user: UserDto,
    @Body() dto: CreateClientDto,
  ): Promise<UserDto> {
    return this.clients.create(user.id, dto);
  }

  /** EXTENSIÓN: corregir nombre, email o contraseña de un cliente propio. */
  @Patch(':id')
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<UserDto> {
    return this.clients.update(user.id, id, dto);
  }

  /** EXTENSIÓN: baja lógica. Conserva el historial, corta el acceso. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.clients.remove(user.id, id);
  }
}
