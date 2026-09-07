/**
 * Apaga el rate limit para el resto de los suites.
 *
 * Corren cientos de requests desde la misma IP en pocos segundos, así que con
 * el límite puesto fallarían por motivos que no tienen nada que ver con lo que
 * están probando. `throttle.e2e-spec.ts` lo vuelve a prender para probarlo.
 */
process.env.THROTTLE_DISABLED = '1';
