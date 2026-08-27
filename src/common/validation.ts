import { BadRequestException, ValidationPipe } from '@nestjs/common';

/**
 * Pipe de validación de la app. Se comparte con los tests e2e para que prueben
 * exactamente la configuración que corre de verdad.
 */
export const buildValidationPipe = (): ValidationPipe =>
  new ValidationPipe({
    // Descarta propiedades que no estén en el DTO en vez de rechazar el
    // request: el front ya está escrito y un campo de más no debe romperlo.
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    // El contrato pide `{ message: string }`; por defecto ValidationPipe
    // devuelve un array de strings.
    exceptionFactory: (errors) =>
      new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ') ||
          'Validación fallida',
      ),
  });
