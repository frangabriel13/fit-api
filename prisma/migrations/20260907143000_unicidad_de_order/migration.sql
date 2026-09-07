-- Unicidad de `order` entre hermanos VIVOS.
--
-- El índice es PARCIAL (`WHERE "deletedAt" IS NULL`) y por eso está escrito a
-- mano en vez de generado: Prisma no sabe expresar un índice parcial en
-- `schema.prisma`. Y tiene que ser parcial, porque el soft delete conserva las
-- filas borradas con su `order` intacto: con un índice total, un día borrado
-- con order=2 bloquearía para siempre al próximo día 2 de ese microciclo.
--
-- Verificado con `prisma migrate diff` en las dos direcciones (schema -> base y
-- base -> schema): Prisma 7.10 da diff vacío, o sea que ni lo reporta como
-- drift ni lo intenta borrar en la próxima migración. Vive solo acá, y por eso
-- la unicidad se prueba en `test/reorder.e2e-spec.ts` y no se puede leer del
-- schema.

CREATE UNIQUE INDEX "Microcycle_splitId_order_vivos_key"
  ON "Microcycle" ("splitId", "order")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Day_microcycleId_order_vivos_key"
  ON "Day" ("microcycleId", "order")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "DayExercise_dayId_order_vivos_key"
  ON "DayExercise" ("dayId", "order")
  WHERE "deletedAt" IS NULL;
