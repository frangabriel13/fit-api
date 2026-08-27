/**
 * Día calendario de un instante, en una zona horaria dada ("2026-08-27").
 *
 * Hace falta porque el frontend decide si "hay sesión de hoy" comparando
 * contra el calendario del navegador (`lib/dates.ts` → `isToday`), mientras
 * que el server corre en UTC. Sin esto, entrenar a las 21hs en Argentina cae
 * en el día UTC siguiente y se crearía una sesión duplicada.
 */
export const dayKey = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
