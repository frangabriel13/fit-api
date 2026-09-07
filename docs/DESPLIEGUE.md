# Despliegue

## La imagen

Multi-etapa: el compilador y la CLI de build se quedan en la etapa `build` y no
viajan a la final. Corre como usuario `node`, no como root.

```bash
docker build -t fit-api .

docker run --init -p 3003:3003 \
  -e DATABASE_URL="postgresql://usuario:clave@host:5432/fitback?schema=public" \
  -e JWT_SECRET="un-secreto-largo-y-aleatorio-de-verdad" \
  -e CORS_ORIGIN="https://el-dominio-del-front" \
  -e PORT=3003 \
  fit-api
```

`--init` no es opcional: sin él Node queda como PID 1, no recibe `SIGTERM` y
`enableShutdownHooks` no llega a cerrar las conexiones. En compose es
`init: true`.

Pesa ~570 MB, y ~426 MB son `node_modules`. La mayor parte es Prisma: desde la
versión 7 `@prisma/client` depende del paquete `prisma` completo, que arrastra
la CLI, TypeScript y drivers de bases que no usamos. No hay mucho para recortar
sin romper cosas. El lado bueno es que la CLI queda disponible en la imagen, que
es lo que hace posible el paso de migración de abajo.

## Migraciones: un paso de release, no del arranque

El contenedor **no** migra al arrancar, a propósito: con dos réplicas, las dos
migrarían a la vez. Va como paso separado, antes de levantar la versión nueva:

```bash
docker run --rm \
  -e DATABASE_URL="..." \
  fit-api node_modules/.bin/prisma migrate deploy
```

Siempre `migrate deploy`, nunca `migrate dev`: `dev` puede decidir que la base
está fuera de sincronía y ofrecer resetearla.

## Variables de entorno

Están todas en `.env.example` con su explicación. Las tres que hay que revisar
sí o sí antes de un despliegue real:

- **`JWT_SECRET`** — largo y aleatorio. Cambiarlo invalida todas las sesiones.
- **`CORS_ORIGIN`** — el dominio del front. Si queda vacío, la API acepta
  cualquier origen.
- **`TRUST_PROXY`** — la cantidad de proxies que haya adelante. Dejarlo vacío si
  no hay ninguno: confiar en `X-Forwarded-For` sin un proxy real deja que
  cualquiera se invente la IP y saltee el rate limit.

## Qué protege la app

- **helmet** con los defaults, salvo `crossOriginResourcePolicy: cross-origin`,
  porque el front vive en otro origen y el default se lo bloquearía.
- **Rate limit** por IP: 300/min general y 10/min en `/auth/login` y
  `/auth/refresh`, que son los únicos donde adivinar sirve de algo. Configurable
  por `THROTTLE_LIMIT` y `THROTTLE_AUTH_LIMIT`.
- Todo esto vive en `src/common/bootstrap.ts` y no en `main.ts`, para que los
  tests e2e prueben la misma configuración que se despliega.

## CI

`.github/workflows/ci.yml` corre en push y PR sobre `main` y `develop`: levanta
un Postgres, migra, siembra, y pasa lint, tipos, build y los e2e. Un segundo job
construye la imagen para enterarse de que el Dockerfile se rompió en el commit
que lo rompió y no el día del deploy.

La base de CI arranca vacía y los suites dan por sentadas tres cuentas y una
rutina asignada, así que hay un seed aparte:

```bash
npm run db:seed:e2e
```

`db:seed` no sirve para eso: solo resetea las contraseñas de los usuarios que ya
existen, porque en desarrollo la base viene heredada. `db:seed:e2e` sí crea, es
idempotente y no le pisa el nombre a las cuentas que ya estén.

## Sobre `npm audit`

Quedan 4 avisos `high`, todos de **mysql2**, que entra como dependencia
transitiva de `prisma`. Usamos PostgreSQL: ese driver nunca se carga. El
`npm audit fix --force` "arregla" bajando Prisma a 6.19.3, que rompe el proyecto
—el schema usa la configuración de la 7— así que **no correrlo**.
