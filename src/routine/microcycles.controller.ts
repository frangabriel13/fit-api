import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import type { UserDto } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateMicrocycleDto, UpdateMicrocycleDto } from './dto/microcycle.dto';
import { ReorderDto } from './dto/reorder.dto';
import { MicrocyclesService } from './microcycles.service';
import type { MicrocycleDto } from './routine.types';

@Controller()
export class MicrocyclesController {
  constructor(private readonly microcycles: MicrocyclesService) {}

  @Post('splits/:splitId/microcycles')
  create(
    @CurrentUser() user: UserDto,
    @Param('splitId', ParseUUIDPipe) splitId: string,
    @Body() dto: CreateMicrocycleDto,
  ): Promise<MicrocycleDto> {
    return this.microcycles.create(user, splitId, dto);
  }

  /**
   * EXTENSIÓN: reorden en bloque. `ids` es la lista completa de hermanos
   * vivos en el orden deseado, y se aplica en una transacción. Reemplaza a
   * los N `PATCH { order }` sueltos, que podían quedar a medio aplicar.
   */
  @Put('splits/:splitId/microcycles/order')
  reorder(
    @CurrentUser() user: UserDto,
    @Param('splitId', ParseUUIDPipe) splitId: string,
    @Body() dto: ReorderDto,
  ): Promise<MicrocycleDto[]> {
    return this.microcycles.reorder(user, splitId, dto.ids);
  }

  @Patch('microcycles/:id')
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMicrocycleDto,
  ): Promise<MicrocycleDto> {
    return this.microcycles.update(user, id, dto);
  }

  @Delete('microcycles/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.microcycles.remove(user, id);
  }
}
