import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import { purgarUsuariosDePrueba } from './helpers';

/**
 * Alta de usuarios: `POST /clients` y `POST /auth/change-password`.
 *
 * Los usuarios que crea este suite llevan un prefijo reconocible en el email y
 * se borran al final; nunca toca las contraseñas de los usuarios del seed,
 * porque los demás suites se loguean con ellas.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};
const CLIENT = { email: 'diamela@fitness.com', password: 'fitdev1234' };

const PREFIJO = 'e2e-alta-';
const PASSWORD = 'provisoria123';

interface ErrorBody {
  message: string;
}

describe('Alta de usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainerToken: string;
  let clientToken: string;
  let contador = 0;

  const login = (body: { email: string; password: string }) =>
    request(http).post('/auth/login').send(body);

  const nuevoEmail = () =>
    `${PREFIJO}${Date.now()}-${contador++}@fitfront.test`;

  const crearCliente = (body: object, token = trainerToken) =>
    request(http)
      .post('/clients')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  /** Da de alta un cliente nuevo y devuelve sus credenciales. */
  const clienteNuevo = async () => {
    const email = nuevoEmail();
    const res = await crearCliente({
      email,
      name: 'Cliente de prueba',
      password: PASSWORD,
    }).expect(201);
    return { email, password: PASSWORD, user: res.body as UserDto };
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    // Restos de una corrida anterior que se haya cortado a la mitad.
    await purgarUsuariosDePrueba(app, PREFIJO);

    trainerToken = ((await login(TRAINER)).body as LoginResponseDto)
      .accessToken;
    clientToken = ((await login(CLIENT)).body as LoginResponseDto).accessToken;
  });

  afterAll(async () => {
    await purgarUsuariosDePrueba(app, PREFIJO);
    await app.close();
  });

  describe('POST /clients — permisos', () => {
    it('sin token -> 401', () =>
      request(http)
        .post('/clients')
        .send({ email: nuevoEmail(), name: 'X', password: PASSWORD })
        .expect(401));

    it('como client -> 403, NUNCA 401: un 401 acá desloguearía al usuario', () =>
      crearCliente(
        { email: nuevoEmail(), name: 'X', password: PASSWORD },
        clientToken,
      ).expect(403));
  });

  describe('POST /clients — alta', () => {
    it('devuelve el User del contrato, sin password y con role client', async () => {
      const { user, email } = await clienteNuevo();

      expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name', 'role']);
      expect(user).not.toHaveProperty('password');
      expect(user.email).toBe(email);
      expect(user.role).toBe('client');
    });

    it('queda en la cartera del entrenador que lo creó', async () => {
      const { user } = await clienteNuevo();

      const res = await request(http)
        .get('/clients')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      const ids = (res.body as UserDto[]).map((u) => u.id);
      expect(ids).toContain(user.id);
    });

    it('el cliente creado puede loguearse con esa contraseña', async () => {
      const { email, password } = await clienteNuevo();

      const res = await login({ email, password }).expect(200);
      expect((res.body as LoginResponseDto).user.email).toBe(email);
    });

    it('normaliza el email: se guarda en minúsculas y sin espacios', async () => {
      const email = nuevoEmail();
      const res = await crearCliente({
        email: `  ${email.toUpperCase()}  `,
        name: 'Mayúsculas',
        password: PASSWORD,
      }).expect(201);

      expect((res.body as UserDto).email).toBe(email);
      await login({ email, password: PASSWORD }).expect(200);
    });

    it('recorta el nombre', async () => {
      const res = await crearCliente({
        email: nuevoEmail(),
        name: '  Con espacios  ',
        password: PASSWORD,
      }).expect(201);

      expect((res.body as UserDto).name).toBe('Con espacios');
    });

    it('email repetido -> 409, no 500', async () => {
      const { email } = await clienteNuevo();

      const res = await crearCliente({
        email,
        name: 'Repetido',
        password: PASSWORD,
      }).expect(409);

      expect(typeof (res.body as ErrorBody).message).toBe('string');
    });

    it('mandar role: trainer en el body no escala privilegios', async () => {
      const res = await crearCliente({
        email: nuevoEmail(),
        name: 'Aspirante',
        password: PASSWORD,
        role: 'trainer',
        trainerId: '00000000-0000-4000-8000-000000000000',
      }).expect(201);

      expect((res.body as UserDto).role).toBe('client');
    });

    it('email inválido -> 400', () =>
      crearCliente({
        email: 'no-es-un-email',
        name: 'X',
        password: PASSWORD,
      }).expect(400));

    it('contraseña corta -> 400', () =>
      crearCliente({
        email: nuevoEmail(),
        name: 'X',
        password: 'corta',
      }).expect(400));

    it('nombre vacío -> 400', () =>
      crearCliente({
        email: nuevoEmail(),
        name: '',
        password: PASSWORD,
      }).expect(400));

    it('nombre de solo espacios -> 400, no un nombre vacío guardado', () =>
      crearCliente({
        email: nuevoEmail(),
        name: '   ',
        password: PASSWORD,
      }).expect(400));
  });

  describe('POST /auth/change-password', () => {
    const cambiar = (token: string, body: object) =>
      request(http)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    /** Token de un cliente recién creado, para no tocar los del seed. */
    const tokenNuevo = async () => {
      const { email, password } = await clienteNuevo();
      const res = await login({ email, password }).expect(200);
      return {
        email,
        password,
        token: (res.body as LoginResponseDto).accessToken,
      };
    };

    it('sin token -> 401', () =>
      request(http)
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'otracosa123' })
        .expect(401));

    it('contraseña actual incorrecta -> 400, NUNCA 401: no debe desloguear', async () => {
      const { token } = await tokenNuevo();

      const res = await cambiar(token, {
        currentPassword: 'no-es-la-mia',
        newPassword: 'otracosa123',
      }).expect(400);

      expect(typeof (res.body as ErrorBody).message).toBe('string');
    });

    it('la nueva igual a la actual -> 400', async () => {
      const { token, password } = await tokenNuevo();

      await cambiar(token, {
        currentPassword: password,
        newPassword: password,
      }).expect(400);
    });

    it('la nueva demasiado corta -> 400', async () => {
      const { token, password } = await tokenNuevo();

      await cambiar(token, {
        currentPassword: password,
        newPassword: 'corta',
      }).expect(400);
    });

    it('con la actual correcta -> 204, y a partir de ahí vale la nueva', async () => {
      const { token, email, password } = await tokenNuevo();
      const nueva = 'nuevaClave456';

      await cambiar(token, {
        currentPassword: password,
        newPassword: nueva,
      }).expect(204);

      await login({ email, password }).expect(401);
      await login({ email, password: nueva }).expect(200);
    });
  });
});
