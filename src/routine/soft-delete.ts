import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Borrado lógico del árbol de rutinas.
 *
 * Borrar de verdad no es una opción: las FKs van en cascada hasta `SetLog`
 * por dos caminos (DayExercise -> SetLog, y Day -> WorkoutSession -> SetLog),
 * así que sacar un ejercicio de una rutina destruiría el historial de series
 * que el cliente ya registró — que es justamente lo que le da valor a la app.
 *
 * En vez de eso se marca `deletedAt` y se propaga hacia abajo, para que el
 * estado quede consistente y las lecturas puedan filtrar por un solo campo.
 * La cascada de la base queda como red de seguridad, pero nunca se dispara.
 */
type Tx = Prisma.TransactionClient | PrismaClient;

const vivo = { deletedAt: null };

export const softDeleteSplit = async (tx: Tx, splitId: string, at: Date) => {
  await tx.dayExercise.updateMany({
    where: { day: { microcycle: { splitId } }, ...vivo },
    data: { deletedAt: at },
  });
  await tx.day.updateMany({
    where: { microcycle: { splitId }, ...vivo },
    data: { deletedAt: at },
  });
  await tx.microcycle.updateMany({
    where: { splitId, ...vivo },
    data: { deletedAt: at },
  });
  await tx.split.update({ where: { id: splitId }, data: { deletedAt: at } });
};

export const softDeleteMicrocycle = async (
  tx: Tx,
  microcycleId: string,
  at: Date,
) => {
  await tx.dayExercise.updateMany({
    where: { day: { microcycleId }, ...vivo },
    data: { deletedAt: at },
  });
  await tx.day.updateMany({
    where: { microcycleId, ...vivo },
    data: { deletedAt: at },
  });
  await tx.microcycle.update({
    where: { id: microcycleId },
    data: { deletedAt: at },
  });
};

export const softDeleteDay = async (tx: Tx, dayId: string, at: Date) => {
  await tx.dayExercise.updateMany({
    where: { dayId, ...vivo },
    data: { deletedAt: at },
  });
  await tx.day.update({ where: { id: dayId }, data: { deletedAt: at } });
};

export const softDeleteExercise = async (
  tx: Tx,
  exerciseId: string,
  at: Date,
) => {
  await tx.dayExercise.update({
    where: { id: exerciseId },
    data: { deletedAt: at },
  });
};
