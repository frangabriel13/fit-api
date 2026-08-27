import { Injectable } from '@nestjs/common';

import { UserDto } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** La cartera del entrenador: sus clientes a cargo. */
  findForTrainer(trainerId: string): Promise<UserDto[]> {
    return this.prisma.user.findMany({
      where: { trainerId },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
