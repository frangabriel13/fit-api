import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /**
   * Si quien llama no es `trainer` el contrato pide 403, no 401: tiene sesión
   * válida, solo que este recurso no es suyo. Un 401 lo desloguearía.
   */
  @Roles(UserRole.trainer)
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
  @Roles(UserRole.trainer)
  @Post()
  create(
    @CurrentUser() user: UserDto,
    @Body() dto: CreateClientDto,
  ): Promise<UserDto> {
    return this.clients.create(user.id, dto);
  }
}
