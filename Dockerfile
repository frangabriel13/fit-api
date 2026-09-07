# syntax=docker/dockerfile:1

# Imagen de la API en tres etapas: las dependencias de build (que incluyen el
# compilador y la CLI de Prisma) no viajan a la imagen final.

# ---------------------------------------------------------------- build ------
FROM node:24-alpine AS build
WORKDIR /app

# Primero el manifiesto solo: mientras no cambien las dependencias, esta capa
# sale de la caché y no se reinstala nada.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src

# `prisma.config.ts` resuelve `env('DATABASE_URL')` al cargarse, así que
# `generate` falla sin la variable aunque no se conecte a nada. Este valor es de
# mentira y solo existe en esta etapa: no viaja a la imagen final.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

# `generate` va antes del build: el cliente tipado tiene que existir para que
# TypeScript compile.
RUN npx prisma generate && npm run build

# -------------------------------------------------------------- runtime ------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# El cliente generado por Prisma no está en npm: se copia del build. Sin esto
# la app arranca y explota en la primera query.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

# Las migraciones y el schema viajan para poder correr `prisma migrate deploy`
# como paso de release. NO se corren al arrancar: dos réplicas migrando a la vez
# es la forma clásica de romper un deploy.
COPY --from=build /app/prisma ./prisma
COPY prisma.config.ts ./

# `node` ya existe en la imagen oficial. Correr como root no aporta nada acá.
USER node

EXPOSE 3003

# `--init` en el runtime (o `init: true` en compose) para que Node no quede de
# PID 1 y las señales de parada lleguen: es lo que hace que
# `enableShutdownHooks` sirva de algo.
CMD ["node", "--enable-source-maps", "dist/src/main"]
