import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { hashPassword } from '../auth/password';
import { PaginationQueryDto, paginar } from '../common/dto/pagination.dto';
import { normalizeEmail } from '../common/email';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/client.dto';

/** Lo que el contrato llama `User`: nunca sale el hash de la contraseña. */
const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

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
      select: CAMPOS_PUBLICOS,
      orderBy: { name: 'asc' },
      ...paginar(pagina),
    });
  }

  /**
   * Da de alta un cliente ya dentro de la cartera de quien llama.
   *
   * El rol queda fijo en `client`: la creación de entrenadores no pasa por la
   * API, se hace con `npm run user:create`. Así no existe ningún camino HTTP
   * para fabricarse un entrenador.
   */
  async create(trainerId: string, dto: CreateClientDto): Promise<UserDto> {
    try {
      return await this.prisma.user.create({
        data: {
          email: normalizeEmail(dto.email),
          name: dto.name,
          password: await hashPassword(dto.password),
          role: UserRole.client,
          trainerId,
        },
        select: CAMPOS_PUBLICOS,
      });
    } catch (error) {
      // El unique de `email` es la única restricción que puede chocar acá.
      //
      // Devolver 409 le confirma a quien llama que ese email ya existe, cosa
      // que el login evita a propósito. Es un intercambio aceptable: acá quien
      // pregunta es un entrenador autenticado, y sin este error no tendría
      // forma de entender por qué no puede dar de alta a alguien.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
      throw error;
    }
  }
}
