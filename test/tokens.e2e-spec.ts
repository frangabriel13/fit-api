import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { LoginResponseDto, TokensDto } from '../src/auth/auth.types';
import { buildValidationPipe } from '../src/common/validation';
import {
  crearClienteDePrueba,
  PREFIJO_CLIENTE,
  purgarUsuariosDePrueba,
} from './helpers';

/**
 * Refresh, logout y revocación.
 *
 * El agujero que esto cierra: el access token duraba 7 días y nada lo
 * invalidaba antes: cambiar la contraseña no cerraba las sesiones abiertas y no
 * había forma de echar a un token robado.
 */
const TRAINER = {
  email: 'mansilla.franco.1@gmail.com',
  password: 'fitdev1234',
};

describe('Refresh, logout y revocación (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let trainerToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Un usuario descartable recién logueado, con su par de tokens. */
  const sesionNueva = async () => {
    const cliente = await crearClienteDePrueba(http, trainerToken, 'Tokens');
    const login = (
      await request(http)
        .post('/auth/login')
        .send({ email: cliente.email, password: 'clientedeprueba1234' })
        .expect(200)
    ).body as LoginResponseDto;
    return { ...cliente, ...login };
  };

  const refrescar = (refreshToken: string) =>
    request(http).post('/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = app.getHttpServer();

    trainerToken = (
      (await request(http).post('/auth/login').send(TRAINER).expect(200))
        .body as LoginResponseDto
    ).accessToken;
  });

  afterAll(async () => {
    await purgarUsuariosDePrueba(app, PREFIJO_CLIENTE);
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('devuelve también un refreshToken, sin romper lo que ya había', async () => {
      const { accessToken, refreshToken, user } = await sesionNueva();

      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');
      expect(user.id).toEqual(expect.any(String));
    });
  });

  describe('POST /auth/refresh', () => {
    it('canjea el refresh por un par nuevo, y el access nuevo sirve', async () => {
      const vieja = await sesionNueva();

      const res = await refrescar(vieja.refreshToken).expect(200);
      const tokens = res.body as TokensDto;
      expect(Object.keys(tokens).sort()).toEqual([
        'accessToken',
        'refreshToken',
      ]);
      expect(tokens.refreshToken).not.toBe(vieja.refreshToken);

      await request(http)
        .get('/auth/me')
        .set(auth(tokens.accessToken))
        .expect(200);
    });

    it('es público: no necesita Authorization, que es el punto', async () => {
      const { refreshToken } = await sesionNueva();
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
    });

    it('ROTA: el refresh usado no sirve una segunda vez', async () => {
      const { refreshToken } = await sesionNueva();
      await refrescar(refreshToken).expect(200);
      await refrescar(refreshToken).expect(401);
    });

    it('reusar uno ya rotado cierra TODAS las sesiones del usuario', async () => {
      const vieja = await sesionNueva();
      const tokens = (await refrescar(vieja.refreshToken).expect(200))
        .body as TokensDto;

      // El access nuevo funciona antes del reuso...
      await request(http)
        .get('/auth/me')
        .set(auth(tokens.accessToken))
        .expect(200);

      // ...y alguien reusa el viejo: señal de que la cadena se filtró.
      await refrescar(vieja.refreshToken).expect(401);

      // El refresh legítimo queda revocado, así que no puede seguir renovando.
      await refrescar(tokens.refreshToken).expect(401);
    });

    it('inválido, vacío o ausente -> 401 / 400', async () => {
      await refrescar('no-existe-este-token').expect(401);
      await request(http).post('/auth/refresh').send({}).expect(400);
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: '' })
        .expect(400);
    });

    it('un usuario dado de baja no puede refrescar', async () => {
      const { id, refreshToken } = await sesionNueva();

      await request(http)
        .delete(`/clients/${id}`)
        .set(auth(trainerToken))
        .expect(204);

      await refrescar(refreshToken).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca el refresh de ese dispositivo y devuelve 204', async () => {
      const { accessToken, refreshToken } = await sesionNueva();

      await request(http)
        .post('/auth/logout')
        .set(auth(accessToken))
        .send({ refreshToken })
        .expect(204);

      await refrescar(refreshToken).expect(401);
    });

    it('el access token sigue vivo: es stateless, y eso es lo esperado', async () => {
      const { accessToken, refreshToken } = await sesionNueva();

      await request(http)
        .post('/auth/logout')
        .set(auth(accessToken))
        .send({ refreshToken })
        .expect(204);

      await request(http).get('/auth/me').set(auth(accessToken)).expect(200);
    });

    it('sin body, o con un token que no existe, igual cierra bien', async () => {
      const { accessToken } = await sesionNueva();
      const cerrar = (body: object) =>
        request(http)
          .post('/auth/logout')
          .set(auth(accessToken))
          .send(body)
          .expect(204);

      await cerrar({});
      await cerrar({ refreshToken: 'no-existe' });
    });

    it('no deja cerrar la sesión de otro: sin token -> 401', () =>
      request(http).post('/auth/logout').send({}).expect(401));

    /**
     * Un refresh revocado por logout NO es reuso: que un dispositivo viejo
     * reintente es normal. Si eso disparara el cierre general, cerrar sesión en
     * el celular echaría también de la compu.
     */
    it('reintentar con un refresh ya deslogueado no echa a los demás', async () => {
      const { email } = await sesionNueva();
      const entrar = async () =>
        (
          await request(http)
            .post('/auth/login')
            .send({ email, password: 'clientedeprueba1234' })
            .expect(200)
        ).body as LoginResponseDto;

      const celular = await entrar();
      const compu = await entrar();

      await request(http)
        .post('/auth/logout')
        .set(auth(celular.accessToken))
        .send({ refreshToken: celular.refreshToken })
        .expect(204);

      await refrescar(celular.refreshToken).expect(401);

      // La compu sigue entera: ni su access ni su refresh se vieron afectados.
      await request(http)
        .get('/auth/me')
        .set(auth(compu.accessToken))
        .expect(200);
      await refrescar(compu.refreshToken).expect(200);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('mata el access token al instante, sin esperar a que venza', async () => {
      const { accessToken } = await sesionNueva();
      await request(http).get('/auth/me').set(auth(accessToken)).expect(200);

      await request(http)
        .post('/auth/logout-all')
        .set(auth(accessToken))
        .expect(204);

      await request(http).get('/auth/me').set(auth(accessToken)).expect(401);
    });

    it('cierra también las sesiones de los otros dispositivos', async () => {
      const { email } = await sesionNueva();
      const entrar = async () =>
        (
          await request(http)
            .post('/auth/login')
            .send({ email, password: 'clientedeprueba1234' })
            .expect(200)
        ).body as LoginResponseDto;

      const celular = await entrar();
      const compu = await entrar();

      await request(http)
        .post('/auth/logout-all')
        .set(auth(compu.accessToken))
        .expect(204);

      await request(http)
        .get('/auth/me')
        .set(auth(celular.accessToken))
        .expect(401);
      await refrescar(celular.refreshToken).expect(401);
    });

    it('volver a entrar después funciona: el corte no es permanente', async () => {
      const { email, accessToken } = await sesionNueva();

      await request(http)
        .post('/auth/logout-all')
        .set(auth(accessToken))
        .expect(204);

      const nueva = (
        await request(http)
          .post('/auth/login')
          .send({ email, password: 'clientedeprueba1234' })
          .expect(200)
      ).body as LoginResponseDto;

      await request(http)
        .get('/auth/me')
        .set(auth(nueva.accessToken))
        .expect(200);
    });
  });

  describe('cambiar la contraseña cierra las sesiones viejas', () => {
    it('el token de otro dispositivo muere, el que hizo el cambio sigue', async () => {
      const { email } = await sesionNueva();
      const entrar = async () =>
        (
          await request(http)
            .post('/auth/login')
            .send({ email, password: 'clientedeprueba1234' })
            .expect(200)
        ).body as LoginResponseDto;

      const celular = await entrar();
      const compu = await entrar();

      const tokens = (
        await request(http)
          .post('/auth/change-password')
          .set(auth(compu.accessToken))
          .send({
            currentPassword: 'clientedeprueba1234',
            newPassword: 'otraDistinta456',
          })
          .expect(200)
      ).body as TokensDto;

      // El otro dispositivo queda afuera...
      await request(http)
        .get('/auth/me')
        .set(auth(celular.accessToken))
        .expect(401);
      await refrescar(celular.refreshToken).expect(401);

      // ...y el que cambió la contraseña sigue adentro con el par que le
      // devolvieron. Sin esto, cambiar la contraseña te echaba al login.
      await request(http)
        .get('/auth/me')
        .set(auth(tokens.accessToken))
        .expect(200);
      await refrescar(tokens.refreshToken).expect(200);
    });

    it('el token viejo del MISMO dispositivo tampoco vale ya', async () => {
      const { accessToken } = await sesionNueva();

      await request(http)
        .post('/auth/change-password')
        .set(auth(accessToken))
        .send({
          currentPassword: 'clientedeprueba1234',
          newPassword: 'otraDistinta456',
        })
        .expect(200);

      await request(http).get('/auth/me').set(auth(accessToken)).expect(401);
    });
  });
});
