import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';

/**
 * La distinción 401/403 es la invariante más cara de romper del contrato: un
 * 401 donde correspondía 403 desloguea al usuario y le borra el token.
 *
 * Corre contra la base de desarrollo, con los usuarios del seed
 * (`npm run db:seed`).
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};
const CLIENT = { email: 'diamela@fitness.com', password: 'fitdev1234' };

interface ErrorBody {
  message: string;
}

describe('Auth y códigos de error (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainerToken: string;
  let clientToken: string;

  const login = (body: typeof TRAINER) =>
    request(http).post('/auth/login').send(body);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    trainerToken = ((await login(TRAINER)).body as LoginResponseDto)
      .accessToken;
    clientToken = ((await login(CLIENT)).body as LoginResponseDto).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('devuelve accessToken y user, sin envoltorio', async () => {
      const res = await login(TRAINER).expect(200);
      const body = res.body as LoginResponseDto;

      expect(Object.keys(body).sort()).toEqual(['accessToken', 'user']);
      expect(body).not.toHaveProperty('data');
      expect(body.user).toEqual({
        id: expect.any(String) as unknown,
        email: TRAINER.email,
        name: expect.any(String) as unknown,
        role: 'trainer',
        mustChangePassword: expect.any(Boolean) as unknown,
      });
      expect(body.user).not.toHaveProperty('password');
    });

    it('credenciales inválidas -> 401', () =>
      login({ ...TRAINER, password: 'incorrecta' }).expect(401));

    it('email inexistente -> 401 con el mismo mensaje (no enumera usuarios)', async () => {
      const malPass = await login({ ...TRAINER, password: 'incorrecta' });
      const noExiste = await login({
        email: 'noexiste@nada.com',
        password: 'loquesea',
      });

      expect(noExiste.status).toBe(401);
      expect((noExiste.body as ErrorBody).message).toBe(
        (malPass.body as ErrorBody).message,
      );
    });

    it('email malformado -> 400 con message string, no array', async () => {
      const res = await login({
        email: 'no-es-un-email',
        password: 'x',
      }).expect(400);

      expect(typeof (res.body as ErrorBody).message).toBe('string');
    });
  });

  describe('GET /auth/me', () => {
    it('sin token -> 401', () => request(http).get('/auth/me').expect(401));

    it('token inválido -> 401', () =>
      request(http)
        .get('/auth/me')
        .set('Authorization', 'Bearer basura.no.valida')
        .expect(401));

    it('con token -> 200 y el User del contrato', async () => {
      const res = await request(http)
        .get('/auth/me')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(Object.keys(res.body as UserDto).sort()).toEqual([
        'email',
        'id',
        // EXTENSIÓN: sin esto el front no sabe que la contraseña es la
        // provisoria que le puso el entrenador.
        'mustChangePassword',
        'name',
        'role',
      ]);
    });
  });

  describe('GET /clients — 401 vs 403', () => {
    it('sin token -> 401 (no autenticado)', () =>
      request(http).get('/clients').expect(401));

    it('como trainer -> 200 y array pelado', async () => {
      const res = await request(http)
        .get('/clients')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      const clients = res.body as UserDto[];
      expect(Array.isArray(clients)).toBe(true);
      clients.forEach((u) => expect(u.role).toBe('client'));
    });

    it('como client -> 403, NUNCA 401: un 401 acá desloguearía al usuario', () =>
      request(http)
        .get('/clients')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403));
  });

  describe('GET / (health)', () => {
    it('es público', () => request(http).get('/').expect(200));
  });
});
