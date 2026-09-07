import type { DayExercise } from '@prisma/client';

import { toDayExerciseDto } from './routine.mapper';

const ejercicio = (over: Partial<DayExercise> = {}): DayExercise => ({
  id: 'ex-1',
  dayId: 'dia-1',
  name: 'Sentadilla',
  order: 1,
  targetSets: 4,
  targetRestSeconds: 120,
  notes: null,
  targetRepsMin: 8,
  targetRepsMax: 12,
  targetRirMin: 1,
  targetRirMax: 3,
  toFailure: false,
  supersetGroup: null,
  deletedAt: null,
  ...over,
});

describe('toDayExerciseDto', () => {
  it('el `targetRir` del contrato es el extremo BAJO del rango', () => {
    // La base guarda un rango y el contrato expone un número. El objetivo real
    // de la serie es el mínimo: llegar a RIR 1 es más exigente que a RIR 3.
    const dto = toDayExerciseDto(
      ejercicio({ targetRirMin: 1, targetRirMax: 3 }),
    );

    expect(dto.targetRir).toBe(1);
    expect(dto.targetRirMin).toBe(1);
    expect(dto.targetRirMax).toBe(3);
  });

  it('sin rango cargado, `targetRir` va null y no 0', () => {
    const dto = toDayExerciseDto(
      ejercicio({ targetRirMin: null, targetRirMax: null }),
    );
    expect(dto.targetRir).toBeNull();
  });

  it('no filtra `dayId` ni `deletedAt` a la respuesta', () => {
    const claves = Object.keys(toDayExerciseDto(ejercicio()));
    expect(claves).not.toContain('dayId');
    expect(claves).not.toContain('deletedAt');
  });

  it('lleva los campos de las pantallas nuevas: rangos, fallo y superserie', () => {
    const dto = toDayExerciseDto(
      ejercicio({ toFailure: true, supersetGroup: '04' }),
    );
    expect(dto.toFailure).toBe(true);
    expect(dto.supersetGroup).toBe('04');
    expect(dto.targetRepsMin).toBe(8);
    expect(dto.targetRepsMax).toBe(12);
  });
});
