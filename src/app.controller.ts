import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Liveness. Público a propósito: sirve para chequear que la API está viva. */
  @Public()
  @Get()
  health() {
    return this.appService.health();
  }
}
