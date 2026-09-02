import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { UserDto } from '../auth/auth.types';
import { hashPassword } from '../auth/password';
import { PaginationQueryDto, paginar } from '../common/dto/pagination.dto';
import { patchData } from '../common/patch';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

/** Lo que el contrato llama `User`: nunca sale el hash de la contraseña. */
const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  name: true,
  role: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

/** Los dados de baja no se leen ni se pueden tocar. */
const VIVO = { deletedAt: null } as const;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** La cartera del entrenador: sus clientes a cargo. */
  findForTrainer(
    trainerId: string,
    pagina: PaginationQueryDto = {},
  ): Promise<UserDto[]> {
    return this.prisma.user.findMany({
      where: { trainerId, ...VIVO },
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
    const password = await hashPassword(dto.password);

    return this.conflictoDeEmail(() =>
      this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          password,
          role: UserRole.client,
          trainerId,
          // La eligió el entrenador: el front tiene que empujar a cambiarla.
          mustChangePassword: true,
        },
        select: CAMPOS_PUBLICOS,
      }),
    );
  }

  /** Corrección de los datos de un cliente propio. */
  async update(
    trainerId: string,
    clientId: string,
    dto: UpdateClientDto,
  ): Promise<UserDto> {
    await this.assertEsMiCliente(trainerId, clientId);
    const { password, ...resto } = dto;
    // Contraseña puesta por el entrenador: vuelve a ser provisoria.
    const nueva =
      password !== undefined
        ? { password: await hashPassword(password), mustChangePassword: true }
        : {};

    return this.conflictoDeEmail(() =>
      this.prisma.user.update({
        where: { id: clientId },
        data: { ...patchData(resto), ...nueva },
        select: CAMPOS_PUBLICOS,
      }),
    );
  }

  /**
   * Baja LÓGICA, por el mismo motivo que el árbol de rutinas: borrar de verdad
   * al usuario se lleva puestas sus sesiones y sus series por la cascada de
   * FKs, y ese historial es justamente lo que el entrenador quiere conservar
   * cuando alguien deja de entrenar.
   *
   * El efecto que sí importa es inmediato: no puede loguearse más y sale de la
   * cartera. `JwtStrategy` relee el usuario en cada request, así que también
   * se le corta cualquier sesión que tuviera abierta.
   */
  async remove(trainerId: string, clientId: string): Promise<void> {
    await this.assertEsMiCliente(trainerId, clientId);
    await this.prisma.user.update({
      where: { id: clientId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 404 y no 403 a propósito: un entrenador no tiene por qué enterarse de que
   * el cliente de otro existe.
   */
  private async assertEsMiCliente(
    trainerId: string,
    clientId: string,
  ): Promise<void> {
    const cliente = await this.prisma.user.findFirst({
      where: { id: clientId, trainerId, ...VIVO },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
  }

  /**
   * El unique de `email` es la única restricción que puede chocar en el alta y
   * en la corrección.
   *
   * Devolver 409 le confirma a quien llama que ese email ya existe, cosa que
   * el login evita a propósito. Es un intercambio aceptable: acá quien
   * pregunta es un entrenador autenticado, y sin este error no tendría forma
   * de entender por qué no puede dar de alta a alguien.
   */
  private async conflictoDeEmail<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
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
