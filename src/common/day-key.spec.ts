import { dayKey } from './day-key';

const BA = 'America/Argentina/Buenos_Aires';

/**
 * El día calendario decide si "ya hay sesión de hoy". Si esto se corre, entrenar
 * de noche crea una sesión duplicada o pisa la del día anterior.
 */
describe('dayKey', () => {
  it('devuelve el día en formato ISO corto', () => {
    expect(dayKey(new Date('2026-08-27T12:00:00Z'), 'UTC')).toBe('2026-08-27');
  });

  it('a las 21hs en Argentina sigue siendo el mismo día, aunque en UTC ya no', () => {
    // 21:00 en Buenos Aires (UTC-3) son las 00:00 UTC del día siguiente. Este
    // es el caso real: alguien entrenando de noche.
    const nocheEnBA = new Date('2026-08-28T00:30:00Z');

    expect(dayKey(nocheEnBA, 'UTC')).toBe('2026-08-28');
    expect(dayKey(nocheEnBA, BA)).toBe('2026-08-27');
  });

  it('a la mañana temprano las dos zonas coinciden', () => {
    const mañana = new Date('2026-08-27T13:00:00Z');
    expect(dayKey(mañana, BA)).toBe('2026-08-27');
    expect(dayKey(mañana, 'UTC')).toBe('2026-08-27');
  });

  it('rellena mes y día con cero: el orden alfabético tiene que ser cronológico', () => {
    expect(dayKey(new Date('2026-01-05T12:00:00Z'), 'UTC')).toBe('2026-01-05');
  });

  it('dos instantes del mismo día dan la misma clave', () => {
    const a = new Date('2026-08-27T10:00:00Z');
    const b = new Date('2026-08-27T22:00:00Z');
    expect(dayKey(a, 'UTC')).toBe(dayKey(b, 'UTC'));
  });
});
