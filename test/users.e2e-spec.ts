import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, UserDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import { PrismaService } from '../src/prisma/prisma.service';
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
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

      expect(Object.keys(user).sort()).toEqual([
        'email',
        'id',
        'mustChangePassword',
        'name',
        'role',
      ]);
      expect(user.mustChangePassword).toBe(true);
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
  describe('PATCH /clients/:id — corrección', () => {
    it('corrige el nombre y el email', async () => {
      const { user } = await clienteNuevo();
      const email = nuevoEmail();

      const res = await request(http)
        .patch(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .send({
          name: '  Nombre Corregido  ',
          email: `  ${email.toUpperCase()}  `,
        })
        .expect(200);

      const corregido = res.body as UserDto;
      expect(corregido.name).toBe('Nombre Corregido');
      expect(corregido.email).toBe(email);
      await login({ email, password: PASSWORD }).expect(200);
    });

    it('campo ausente = no tocar', async () => {
      const { user, email } = await clienteNuevo();

      const res = await request(http)
        .patch(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .send({ name: 'Solo el nombre' })
        .expect(200);

      expect((res.body as UserDto).email).toBe(email);
    });

    it('resetear la contraseña la vuelve a marcar como provisoria', async () => {
      const { user, email } = await clienteNuevo();

      // El cliente ya la había elegido: deja de ser provisoria.
      const suToken = (
        (await login({ email, password: PASSWORD }).expect(200))
          .body as LoginResponseDto
      ).accessToken;
      await request(http)
        .post('/auth/change-password')
        .set(auth(suToken))
        .send({ currentPassword: PASSWORD, newPassword: 'elegidaporel123' })
        .expect(204);

      const res = await request(http)
        .patch(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .send({ password: 'reseteada9876' })
        .expect(200);

      expect((res.body as UserDto).mustChangePassword).toBe(true);
      await login({ email, password: 'elegidaporel123' }).expect(401);
      await login({ email, password: 'reseteada9876' }).expect(200);
    });

    it('email ya usado -> 409', async () => {
      const primero = await clienteNuevo();
      const segundo = await clienteNuevo();

      await request(http)
        .patch(`/clients/${segundo.user.id}`)
        .set(auth(trainerToken))
        .send({ email: primero.email })
        .expect(409);
    });

    it('nombre vacío -> 400; email inválido -> 400', async () => {
      const { user } = await clienteNuevo();

      await request(http)
        .patch(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .send({ name: '   ' })
        .expect(400);
      await request(http)
        .patch(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .send({ email: 'no-es-un-email' })
        .expect(400);
    });

    it('un cliente de otro entrenador -> 404, no 403: no se filtra que existe', async () => {
      const { user } = await clienteNuevo();

      await request(http)
        .patch(`/clients/${user.id}`)
        .set(auth(clientToken))
        .expect(403); // el rol ya lo corta antes

      // Y un id que no es de su cartera, con el rol correcto:
      await request(http)
        .patch(`/clients/${UUID_INEXISTENTE}`)
        .set(auth(trainerToken))
        .send({ name: 'Nadie' })
        .expect(404);
    });
  });

  describe('DELETE /clients/:id — baja lógica', () => {
    it('sale de la cartera y no puede entrar más', async () => {
      const { user, email } = await clienteNuevo();

      await request(http)
        .delete(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .expect(204);

      const cartera = (
        await request(http).get('/clients').set(auth(trainerToken)).expect(200)
      ).body as UserDto[];
      expect(cartera.map((c) => c.id)).not.toContain(user.id);

      await login({ email, password: PASSWORD }).expect(401);
    });

    it('le corta la sesión abierta en el acto, sin esperar a que venza el token', async () => {
      const { user, email } = await clienteNuevo();
      const suToken = (
        (await login({ email, password: PASSWORD }).expect(200))
          .body as LoginResponseDto
      ).accessToken;

      await request(http).get('/auth/me').set(auth(suToken)).expect(200);

      await request(http)
        .delete(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .expect(204);

      await request(http).get('/auth/me').set(auth(suToken)).expect(401);
    });

    it('es lógica: el usuario sigue en la base con su historial', async () => {
      const { user } = await clienteNuevo();

      await request(http)
        .delete(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .expect(204);

      const prisma = app.get(PrismaService);
      const enLaBase = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, deletedAt: true },
      });
      expect(enLaBase).not.toBeNull();
      expect(enLaBase?.deletedAt).toBeInstanceOf(Date);
    });

    it('darla de baja dos veces -> 404 la segunda', async () => {
      const { user } = await clienteNuevo();

      await request(http)
        .delete(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .expect(204);
      await request(http)
        .delete(`/clients/${user.id}`)
        .set(auth(trainerToken))
        .expect(404);
    });

    it('como client -> 403, nunca 401', async () => {
      const { user } = await clienteNuevo();

      await request(http)
        .delete(`/clients/${user.id}`)
        .set(auth(clientToken))
        .expect(403);
    });
  });

  describe('mustChangePassword', () => {
    it('nace en true y lo apaga el cambio de contraseña', async () => {
      const { email } = await clienteNuevo();

      const antes = (await login({ email, password: PASSWORD }).expect(200))
        .body as LoginResponseDto;
      expect(antes.user.mustChangePassword).toBe(true);

      await request(http)
        .post('/auth/change-password')
        .set(auth(antes.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: 'yalaelegi1234' })
        .expect(204);

      const despues = (
        await login({ email, password: 'yalaelegi1234' }).expect(200)
      ).body as LoginResponseDto;
      expect(despues.user.mustChangePassword).toBe(false);
      const yo = await request(http)
        .get('/auth/me')
        .set(auth(despues.accessToken))
        .expect(200);
      expect((yo.body as UserDto).mustChangePassword).toBe(false);
    });
  });
});
