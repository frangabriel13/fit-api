import { Injectable } from '@nestjs/common';

import { UserDto } from '../auth/auth.types';
import { PaginationQueryDto, paginar } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** La cartera del entrenador: sus clientes a cargo. */
  findForTrainer(
    trainerId: string,
    pagina: PaginationQueryDto = {},
  ): Promise<UserDto[]> {
    return this.prisma.user.findMany({
      where: { trainerId },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: 'asc' },
      ...paginar(pagina),
    });
  }
}
