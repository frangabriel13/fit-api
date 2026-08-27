import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a ciertos roles. Si el usuario está autenticado pero
 * no tiene el rol, RolesGuard responde 403 — nunca 401, que desloguearía.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
