import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/bootstrap';

/**
 * Cabeceras de seguridad y rate limit.
 *
 * Levanta la app con `configureApp`, que es exactamente lo que corre en
 * producción: si esto se probara con la app pelada, no estaría probando nada.
 */
describe('Hardening: cabeceras y rate limit (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    process.env.THROTTLE_DISABLED = '1';
    await app.close();
  });

  describe('helmet', () => {
    it('pone las cabeceras de seguridad y saca la que delata el stack', async () => {
      const res = await request(http).get('/').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['strict-transport-security']).toBeDefined();
      // Express anuncia "X-Powered-By: Express" por defecto: helmet lo saca.
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('CORP en cross-origin: el front está en otro puerto', async () => {
      const res = await request(http).get('/').expect(200);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('no rompe el CORS que el front necesita', async () => {
      const res = await request(http)
        .get('/')
        .set('Origin', 'http://localhost:3002')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('rate limit', () => {
    // El resto de los suites lo corren apagado (`setup-e2e.ts`); acá se prende
    // para probar justamente que corta.
    beforeEach(() => {
      process.env.THROTTLE_DISABLED = '0';
    });
    afterEach(() => {
      process.env.THROTTLE_DISABLED = '1';
    });

    it('corta el bombardeo a /auth/login con 429', async () => {
      const intento = () =>
        request(http)
          .post('/auth/login')
          .send({ email: 'no-existe@fitfront.test', password: 'loquesea123' });

      const codigos: number[] = [];
      for (let i = 0; i < 14; i++) codigos.push((await intento()).status);

      // Los primeros rebotan por credenciales; pasado el tope, por rate limit.
      expect(codigos.slice(0, 8).every((c) => c === 401)).toBe(true);
      expect(codigos).toContain(429);
    });

    it('el tope de credenciales no le pega al resto de la API', async () => {
      // Se quema el cupo de login...
      for (let i = 0; i < 14; i++) {
        await request(http)
          .post('/auth/login')
          .send({ email: 'no-existe@fitfront.test', password: 'loquesea123' });
      }

      // ...y el health sigue contestando: el límite general es mucho más alto,
      // porque el uso normal del front son ráfagas.
      for (let i = 0; i < 14; i++) {
        await request(http).get('/').expect(200);
      }
    });
  });
});
