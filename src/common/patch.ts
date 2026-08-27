/**
 * Convierte el DTO de un PATCH en el `data` de Prisma.
 *
 * Semántica: campo ausente = no tocar; `null` explícito = borrar el valor.
 * Es la regla estándar de PATCH y es la OPUESTA a la del
 * `PUT /sessions/:id/set-logs`, donde ausente sí significa NULL porque el
 * front manda el estado completo de cada serie.
 *
 * El filtro por `undefined` hace falta porque class-transformer materializa
 * los campos declarados del DTO aunque no vengan en el body.
 */
export const patchData = <T extends object>(dto: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
