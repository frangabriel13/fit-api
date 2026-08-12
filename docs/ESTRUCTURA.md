# Estructura del proyecto (NestJS) vs Node "puro"

Este documento explica cómo está organizado `fit-api` (NestJS 11) comparándolo
con lo que harías en un proyecto Node/Express típico. La idea es mapear
conceptos que ya conocés a los nuevos.

## Árbol de archivos actual

```
fit-api/
├── src/
│   ├── main.ts                  # Punto de entrada (equivalente a index.js/server.js)
│   ├── app.module.ts            # Módulo raíz de la aplicación
│   ├── app.controller.ts        # Controlador (define rutas)
│   ├── app.controller.spec.ts   # Test unitario del controlador
│   └── app.service.ts           # Servicio (lógica de negocio)
├── test/
│   ├── app.e2e-spec.ts          # Test end-to-end (levanta la app entera)
│   └── jest-e2e.json            # Config de Jest solo para e2e
├── dist/                        # Output compilado (JS), generado por build
├── nest-cli.json                # Config del CLI de Nest (nest build/start)
├── tsconfig.json                # Config de TypeScript
├── tsconfig.build.json          # Config de TS específica para build
├── eslint.config.mjs            # Config de ESLint
├── .prettierrc                  # Config de Prettier
└── package.json
```

## Comparación rápida con Express

| Node/Express                          | NestJS                                              |
|----------------------------------------|------------------------------------------------------|
| `index.js` con `app.listen()`          | `src/main.ts` con `NestFactory.create()` + `listen()` |
| Definís rutas con `app.get('/ruta', fn)` | Definís rutas con decoradores `@Get()` en un `@Controller()` |
| Lógica de negocio mezclada en el handler o en un `services/` a mano | Lógica separada en clases `@Injectable()` (servicios) |
| `require`/`module.exports` para "armar" la app | `@Module()` declara explícitamente qué controladores/servicios existen y cómo se conectan |
| Inyectás dependencias a mano (`new Service()` o pasando por parámetro) | Inyección de dependencias automática vía constructor (Nest resuelve e instancia por vos) |
| Middlewares de Express (`app.use()`) | Middlewares, **Guards**, **Interceptors** y **Pipes** (roles más específicos) |
| Sin estructura impuesta — cada proyecto organiza distinto | Estructura modular impuesta: cada feature es un `Module` con su `Controller` + `Service` |

## Archivo por archivo

### `src/main.ts` — el punto de entrada

Es el equivalente a tu `index.js`. Acá se crea la instancia de la aplicación
y se la pone a escuchar en un puerto.

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule); // arma toda la app a partir del módulo raíz
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

En Express harías algo como:

```js
const express = require('express');
const app = express();
app.listen(process.env.PORT ?? 3000);
```

La diferencia clave: en Express vos armás `app` agregando rutas y middlewares
uno por uno en este mismo archivo (o importándolos). En Nest, `main.ts` no
sabe nada de rutas — solo le dice a Nest "arrancá desde `AppModule`", y todo
el árbol de módulos/controladores/servicios se resuelve automáticamente.

### `src/app.module.ts` — el módulo raíz

No tiene equivalente directo en Express porque Express no obliga a modularizar.
Es la pieza que le dice a Nest **qué existe** en la aplicación:

```ts
@Module({
  imports: [],            // otros módulos que este módulo usa (ej: UsersModule, AuthModule)
  controllers: [AppController], // controladores (rutas) que pertenecen a este módulo
  providers: [AppService],      // servicios/lógica inyectable de este módulo
})
export class AppModule {}
```

Pensalo como un "manifiesto": en vez de que `main.ts` importe rutas de acá y
servicios de allá como en Express, cada feature (ej. `users`, `workouts`,
`auth`) tendría su propio módulo (`UsersModule`, `WorkoutsModule`, etc.) que
declara sus propios controllers/providers, y `AppModule` los importa todos.

### `src/app.controller.ts` — el controlador (rutas)

Es el equivalente a un archivo de rutas de Express (`routes/users.js`), pero
en vez de registrar funciones con `router.get(...)`, usás decoradores sobre
métodos de una clase:

```ts
@Controller()               // equivalente a: const router = express.Router()
export class AppController {
  constructor(private readonly appService: AppService) {} // <- inyección de dependencias

  @Get()                     // equivalente a: router.get('/', handler)
  getHello(): string {
    return this.appService.getHello();
  }
}
```

Notá el `constructor(private readonly appService: AppService)`: eso es
**inyección de dependencias**. Vos no hacés `new AppService()` en ningún
lado — Nest ve que `AppController` necesita un `AppService`, lo busca (o
crea) y te lo pasa solo. En Express esto lo harías manualmente, por ejemplo
pasando el service como parámetro a la función que crea el router.

Si el controlador tuviera un prefijo, ej. `@Controller('users')`, todas las
rutas de esa clase quedarían bajo `/users/...` — como montar un router con
`app.use('/users', usersRouter)`.

### `src/app.service.ts` — el servicio (lógica de negocio)

Es donde vive la lógica real, separada del controlador (que solo debería
orquestar request/response). Es una clase normal marcada con `@Injectable()`
para que Nest sepa que puede inyectarla en otras clases:

```ts
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

En un proyecto Node sin framework, esto sería tu carpeta `services/` o
`lib/`, salvo que acá el decorador `@Injectable()` es lo que le permite a
Nest instanciarlo automáticamente y compartir la misma instancia (por
defecto, singleton) entre quienes lo necesiten.

### `src/app.controller.spec.ts` y `test/app.e2e-spec.ts` — tests

- **`*.spec.ts` junto al código** (`app.controller.spec.ts`): test unitario.
  Usa `Test.createTestingModule(...)` de `@nestjs/testing`, que es un
  mini-contenedor de inyección de dependencias solo para tests — le decís
  qué controller/service usar (podrías mockear el service) y te da una
  instancia ya armada.
- **`test/app.e2e-spec.ts`**: test end-to-end, levanta la aplicación
  completa (`app.init()`) y le pega peticiones HTTP reales con `supertest`,
  igual que harías en Express con `supertest(app)`.

### `nest-cli.json`

Config del CLI de Nest (comando `nest`). Le dice, por ejemplo, que el código
fuente está en `src/` y que borre `dist/` antes de cada build
(`deleteOutDir: true`). Es análogo a scripts de build que armarías a mano en
`package.json` con `tsc` en un proyecto Node+TS sin framework.

### `tsconfig.json` / `tsconfig.build.json`

Config estándar de TypeScript. `tsconfig.build.json` extiende la general pero
excluye archivos de test a la hora de compilar para producción — mismo
concepto que tendrías en cualquier proyecto Node+TS.

### `eslint.config.mjs` / `.prettierrc`

Lint y formateo, iguales conceptualmente a cualquier proyecto Node — no son
específicos de Nest.

## El flujo completo de un request

1. Llega un `GET /` al servidor.
2. Nest lo enruta al método `@Get()` que matchea, dentro de `AppController`.
3. Antes de tu handler pueden correr (si estuvieran configurados):
   **Middleware → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post)**.
   Hoy este proyecto no usa ninguno de esos, pero es donde luego irían cosas
   como autenticación (`Guard`), validación de body (`Pipe` con
   `class-validator`), logging, etc.
4. El handler (`getHello`) delega en `AppService.getHello()` — el
   controlador no tiene lógica de negocio, solo la pide.
5. Se devuelve la respuesta.

## Cómo crecería este proyecto (a diferencia de Express)

Hoy solo existe el módulo raíz `AppModule` con un controller/service
genéricos — es literalmente el scaffold de `nest new`, sin dominio propio
todavía. Al agregar features reales (ej. `users`, `workouts`), en Nest la
convención es una carpeta por feature, cada una como su propio módulo:

```
src/
├── app.module.ts
├── main.ts
└── users/
    ├── users.module.ts
    ├── users.controller.ts
    ├── users.service.ts
    ├── dto/
    │   └── create-user.dto.ts   # forma del body esperado + validaciones
    └── entities/
        └── user.entity.ts       # forma de los datos en la DB (si usás un ORM)
```

En Express esto normalmente sería una carpeta `routes/users.js` +
`controllers/users.js` + `services/users.js` a mano, sin nada que verifique
que están conectados correctamente. En Nest, `UsersModule` es explícito
sobre esas conexiones, y `AppModule` simplemente hace
`imports: [UsersModule]`.

El comando `nest g module users` / `nest g controller users` /
`nest g service users` genera estos archivos automáticamente (equivalente a
un generador de boilerplate que en Express tendrías que armar vos mismo o
copiar a mano).
