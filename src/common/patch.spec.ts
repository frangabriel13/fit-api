import { patchData } from './patch';

/**
 * La regla del PATCH: ausente = no tocar, `null` = borrar. Es la OPUESTA a la
 * del upsert de series, así que conviene tenerla clavada.
 */
describe('patchData', () => {
  it('deja pasar los valores presentes', () => {
    expect(patchData({ name: 'Nuevo', order: 3 })).toEqual({
      name: 'Nuevo',
      order: 3,
    });
  });

  it('descarta los `undefined`: class-transformer los materializa igual', () => {
    // El DTO declara `name`, `order` y `focus`; el body solo trajo `name`.
    expect(
      patchData({ name: 'Nuevo', order: undefined, focus: undefined }),
    ).toEqual({ name: 'Nuevo' });
  });

  it('CONSERVA el `null`: es un borrado explícito, no una ausencia', () => {
    expect(patchData({ description: null })).toEqual({ description: null });
  });

  it('conserva los falsy que sí son valores', () => {
    expect(patchData({ order: 0, toFailure: false, notes: '' })).toEqual({
      order: 0,
      toFailure: false,
      notes: '',
    });
  });

  it('un DTO entero de `undefined` da un update vacío, no uno que pisa todo', () => {
    expect(patchData({ a: undefined, b: undefined })).toEqual({});
  });
});
