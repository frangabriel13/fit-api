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
import { ListSplitsQueryDto } from './dto/list-splits.dto';
import { CreateSplitDto, UpdateSplitDto } from './dto/split.dto';
import type { SplitDto } from './routine.types';
import { SplitsService } from './splits.service';

@Controller('splits')
export class SplitsController {
  constructor(private readonly splits: SplitsService) {}

  @Get()
  findAll(
    @CurrentUser() user: UserDto,
    @Query() query: ListSplitsQueryDto,
  ): Promise<SplitDto[]> {
    return this.splits.findAll(user, query.clientId, query);
  }

  /** Anidado completo: Split -> microcycles -> days -> exercises. */
  @Get(':id')
  findOne(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SplitDto> {
    return this.splits.findOne(user, id);
  }

  /** Las rutinas las arma el entrenador; un cliente recibe 403. */
  @Roles(UserRole.trainer)
  @Post()
  create(
    @CurrentUser() user: UserDto,
    @Body() dto: CreateSplitDto,
  ): Promise<SplitDto> {
    return this.splits.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSplitDto,
  ): Promise<SplitDto> {
    return this.splits.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.splits.remove(user, id);
  }
}
