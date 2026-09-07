import { normalizeEmail } from './email';

/**
 * Tiene que ser la misma función en el alta y en el login: si difieren, el
 * usuario queda guardado con una forma y buscado con otra, y no entra nunca.
 */
describe('normalizeEmail', () => {
  it('baja a minúsculas', () => {
    expect(normalizeEmail('Franco@X.COM')).toBe('franco@x.com');
  });

  it('recorta los espacios que deja un copiar/pegar', () => {
    expect(normalizeEmail('  ana@x.com  ')).toBe('ana@x.com');
  });

  it('es idempotente', () => {
    const una = normalizeEmail('  Ana@X.com ');
    expect(normalizeEmail(una)).toBe(una);
  });

  it('el alta y el login llegan al mismo valor desde formas distintas', () => {
    expect(normalizeEmail(' Ana@X.com')).toBe(normalizeEmail('ana@x.com '));
  });
});
