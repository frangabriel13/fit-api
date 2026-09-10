# Contrato de API — FitFront

Este documento describe **la API que el frontend consume**. Ya no es una
propuesta: el frontend está conectado al backend real y todas las pantallas leen
de acá. Cada endpoint y forma de respuesta está verificado contra
`http://localhost:3003`.

Este archivo se mantiene igual en los dos repos (`fitfront/docs/` y
`fit-api/docs/`). Cuando cambia la API, la copia del backend manda.

**Fuente de verdad de los tipos:** `types/api.ts` del repositorio del frontend.
Copiarlo tal cual y derivar de ahí los DTOs de NestJS es lo más seguro.

---

## 0. Cómo se conecta el frontend

En `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3003   # base de la API
```

Es la única variable. Ya no hay capa de mocks: todas las llamadas salen a
`NEXT_PUBLIC_API_URL` y sin la API levantada la app no funciona.

**CORS:** el frontend corre en `http://localhost:3002`. Habilitar ese origen.

---

## 1. Reglas globales

**Envoltorio de respuesta: NINGUNO.** El helper `unwrap()` devuelve
`response.data` directo. Un `GET /splits` debe responder el array pelado
`[{...}]`, **no** `{ "data": [...] }`.

**Autenticación:** JWT en header. El frontend adjunta
`Authorization: Bearer <accessToken>` en **todas** las llamadas si hay token.
El token se guarda en una cookie no-httpOnly (`fitfront_token`), pero **la API
no debe depender de la cookie** — el token viaja solo en el header.

**⚠️ Códigos de error — esto importa mucho:**

| código | significado | qué hace el frontend |
|---|---|---|
| **401** | No autenticado / token vencido o inválido | **Borra el token y redirige a `/login`** |
| **403** | Autenticado, pero sin permiso para este recurso | Muestra el error. **No cierra la sesión.** |

Devolver 401 donde corresponde 403 **desloguea al usuario**. Para "sos un
`client` y esto es de `trainer`" → **403**.

**Formato de error:** `{ "message": string }` (lo que ya devuelve NestJS por
defecto). El frontend no parsea más que el status.

---

## 2. Endpoints

Todos requieren `Authorization` salvo `POST /auth/login`.

### Auth

| método | path | body | respuesta |
|---|---|---|---|
| `POST` | `/auth/login` | `LoginPayload` | `LoginResponse` |
| `GET` | `/auth/me` | — | `User` |
| `POST` | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| `POST` | `/auth/logout` | `{ refreshToken? }` | — (204) |
| `POST` | `/auth/logout-all` | — | — (204) |
| `POST` | `/auth/change-password` | `ChangePasswordPayload` | `{ accessToken, refreshToken }` |

`POST /auth/login` con credenciales inválidas → **401**.

**Sesiones y revocación:**

- `LoginResponse` ahora trae también **`refreshToken`** (aditivo: el front que
  lo ignore sigue andando igual). El `accessToken` es un JWT stateless y el
  refresh es una fila en la base — por eso es el único de los dos que se puede
  revocar de a uno.
- **`POST /auth/refresh` es público**, porque el access token justamente puede
  estar vencido: el refresh ES la credencial. **Rota**: el token usado queda
  revocado y se devuelve otro. Reusar uno ya canjeado cierra TODAS las sesiones
  del usuario, porque es la señal de que la cadena se filtró. Reintentar con uno
  revocado por un logout o un cambio de contraseña NO cuenta como reuso: eso es
  un dispositivo viejo reintentando, y solo da 401.
- **`POST /auth/logout`** revoca el refresh de ESE dispositivo. Siempre 204,
  incluso sin body o con un token que no existe: cerrar sesión no puede fallar.
  El access token sigue vivo hasta vencer — es stateless.
- **`POST /auth/logout-all`** cierra todas las sesiones, incluida la que llama,
  y **mata los access tokens al instante**. Es lo que hay que usar si a alguien
  le robaron el token.
- ⚠️ **`POST /auth/change-password` cambió: era `204`, ahora es `200` con
  `{ accessToken, refreshToken }`.** El cambio de contraseña cierra todas las
  sesiones (antes los tokens ya emitidos sobrevivían, que era el agujero) y
  devuelve un par nuevo para que el dispositivo que lo hizo no quede afuera.
  **El front tiene que guardar ese `accessToken`**; si lo ignora, el siguiente
  request le da 401 y termina en el login.
- `JWT_EXPIRES_IN` sigue en **7d** porque el front todavía no refresca. Cuando
  use `/auth/refresh`, bajarlo a `15m`: es el punto de tener refresh.

### Clientes

| método | path | body | respuesta |
|---|---|---|---|
| `GET` | `/clients` | — | `User[]` |

La cartera del entrenador logueado: los `User` con `role: "client"` a su cargo.
Si quien llama **no** es `trainer` → **403** (no 401, ver arriba).

> El modelo de "qué cliente pertenece a qué entrenador" todavía no existe en el
> frontend. Definilo del lado del backend; el frontend solo consume la lista.

### Splits (rutinas)

| método | path | body | respuesta |
|---|---|---|---|
| `GET` | `/splits` | — | `Split[]` |
| `GET` | `/splits/:id` | — | `Split` |
| `POST` | `/splits` | `SplitPayload` | `Split` |
| `PATCH` | `/splits/:id` | `Partial<SplitPayload>` | `Split` |
| `DELETE` | `/splits/:id` | — | — |

`GET /splits/:id` debe venir **anidado completo**:
`Split → microcycles[] → days[] → exercises[]`. La pantalla de entrenamiento
busca el día dentro de esa estructura, no hace una llamada aparte.

### Microciclos

| método | path | body | respuesta |
|---|---|---|---|
| `POST` | `/splits/:splitId/microcycles` | `MicrocyclePayload` | `Microcycle` |
| `PATCH` | `/microcycles/:id` | `Partial<MicrocyclePayload>` | `Microcycle` |
| `DELETE` | `/microcycles/:id` | — | — |
| `PUT` | `/splits/:splitId/microcycles/order` | `{ ids: string[] }` | `Microcycle[]` |

### Días

| método | path | body | respuesta |
|---|---|---|---|
| `POST` | `/microcycles/:microcycleId/days` | `DayPayload` | `Day` |
| `PATCH` | `/days/:id` | `Partial<DayPayload>` | `Day` |
| `DELETE` | `/days/:id` | — | — |
| `PUT` | `/microcycles/:microcycleId/days/order` | `{ ids: string[] }` | `Day[]` |

### Ejercicios del día

| método | path | body | respuesta |
|---|---|---|---|
| `POST` | `/days/:dayId/exercises` | `DayExercisePayload` | `DayExercise` |
| `PATCH` | `/exercises/:id` | `Partial<DayExercisePayload>` | `DayExercise` |
| `DELETE` | `/exercises/:id` | — | — |
| `PUT` | `/days/:dayId/exercises/order` | `{ ids: string[] }` | `DayExercise[]` |

**Renombrar y el historial:**

- ⚠️ **El historial de progreso se agrupa por NOMBRE de ejercicio**, no por id:
  `GET /splits/:id/progress` devuelve una entrada por nombre, y el front la
  busca como `history[ex.name]`. Un mesociclo repite los mismos ejercicios en
  cada semana, así que la serie histórica se sostiene sobre que el nombre sea
  idéntico en todas.
- Por eso `PATCH /exercises/:id` acepta **`applyToAll: true`**: renombra todas
  las apariciones de ese mismo nombre **dentro de la misma rutina**, que es el
  alcance exacto con el que agrupa el progreso. Sin esto, corregir un typo en
  una sola semana parte el historial en dos entradas y nadie se entera.
- Es **opt-in a propósito**: cambiar una sola semana también es legítimo —en una
  progresión la semana 3 puede pasar a sentadilla frontal—, y propagar siempre
  haría imposible expresarlo.
- Solo se propaga el `name`. El resto de los campos del PATCH se aplican
  únicamente al ejercicio pedido.

**Reorden y unicidad de `order`:**

- **`order` es único entre hermanos vivos.** Crear o mover algo a un `order` ya
  ocupado del mismo padre responde **409**. Lo borrado no ocupa lugar: el
  `order` de un ejercicio borrado se puede reusar.
- **Mover algo es UNA llamada, no N.** Los tres `PUT .../order` reciben la lista
  **completa** de hermanos vivos en el orden deseado y la aplican en una
  transacción. Devuelven la colección ya ordenada, así que no hace falta
  refetchear.
- Es un reemplazo total, no un delta: si faltan hermanos, si viene un id de otro
  padre o si hay ids repetidos, es **400** y no se mueve nada. Mandar dos veces
  el mismo orden da el mismo resultado.
- La renumeración arranca en el **mínimo que ya había**, igual que hace
  `lib/reorder.ts`: los microciclos quedan en 1, 2, 3… (su `order` ES el número
  de semana) y los días y ejercicios en 0, 1, 2… Se lleva puestos los huecos y
  los empates.
- Esto **reemplaza** a `hooks/use-reorder.ts`, que manda N `PATCH { order }` en
  paralelo. Con la unicidad activa esos PATCH ahora pueden chocar entre ellos
  con 409, así que hay que migrar al endpoint nuevo.

### Sesiones de entrenamiento

| método | path | body | respuesta |
|---|---|---|---|
| `GET` | `/days/:dayId/sessions` | — | `WorkoutSession[]` |
| `GET` | `/sessions/:id` | — | `WorkoutSession` |
| `POST` | `/days/:dayId/sessions` | `{}` | `WorkoutSession` |
| `PUT` | `/sessions/:id/set-logs` | `{ setLogs: SetLogUpsert[] }` | `WorkoutSession` |
| `PATCH` | `/set-logs/:id` | `SetLogPatch` | `SetLog` |

**Detalles que el frontend asume:**

- `POST /days/:dayId/sessions` se llama con **body vacío `{}`**. El backend pone
  `performedAt` (ISO 8601). Debe devolver la sesión creada completa.
- El frontend decide si "hay sesión de hoy" comparando `performedAt` contra el
  día del navegador (`hooks/use-active-session.ts`). Mandá `performedAt` en ISO
  con zona, no solo fecha.
- **`PUT /sessions/:id/set-logs` es un UPSERT en lote.** La clave natural es
  `(sessionId, dayExerciseId, setNumber)`: si existe se actualiza, si no se
  crea. **No** es un reemplazo total — los set-logs que no vengan en el body
  deben quedar intactos. Debe devolver la `WorkoutSession` completa con todos
  sus `setLogs`.
- Ese PUT se dispara con debounce de 800 ms mientras el usuario tipea, y de
  inmediato al marcar una serie como completada. Tiene que aguantar llamadas
  seguidas y ser idempotente.
- Campos numéricos ausentes (`actualReps`, `actualRir`, `weight`) significan
  "sin dato" → guardar `NULL`, no `0`.
- **Quién ESCRIBE es más estrecho que quién lee: solo el dueño.** El entrenador
  lee el historial de su cartera pero no escribe en él —`SetLog` no guarda
  autor—, así que `PUT /sessions/:id/set-logs`, `PATCH /sessions/:id`,
  `DELETE /sessions/:id`, `PATCH /set-logs/:id` y `DELETE /set-logs/:id`
  responden **403** con su token. Ver §4.
- **Quién puede leer una sesión es un solo criterio, y los dos GET aplican el
  mismo:** su dueño, o el entrenador del dueño. Cualquier otro, `403`; sin
  token, `401`; id inexistente, `404`. `GET /days/:dayId/sessions` sin
  `userId` devuelve las del que llama —es un *default*, no un recorte de
  alcance—: el entrenador ve las de su cliente pasando `?userId=`.
- **El historial no depende de la asignación vigente.** Desasignar a un cliente
  (`DELETE /splits/:splitId/assignments/:clientId`) desactiva la asignación
  pero no borra nada, así que sus sesiones viejas se siguen leyendo por los dos
  GET. Lo mismo vale para un día o una rutina borrados: el soft delete existe
  para conservar ese historial.
- **Una sesión cerrada (`completedAt != null`) no acepta escrituras sobre sus
  series:** `PUT /sessions/:id/set-logs`, `PATCH /set-logs/:id` y
  `DELETE /set-logs/:id` responden `409`, igual que `DELETE /sessions/:id`.
  Corregir sigue siendo posible, pero como acto explícito: reabrir con
  `PATCH /sessions/:id { completed: false }`, editar y volver a cerrar. La
  razón es que `completedAt` marca "esto ya es una medición hecha" y el front
  decide con él qué entra en la progresión; si se pudiera escribir después del
  cierre, lo agregado más tarde quedaría indistinguible de lo cargado durante
  el entrenamiento.
- **Ojo con el debounce al cerrar:** como el PUT tiene 800 ms de retraso, un
  cierre disparado justo después de tipear puede dejar la última escritura en
  vuelo, que llegaría con la sesión ya cerrada y se perdería con un `409`. El
  front tiene que vaciar la cola de escrituras pendientes ANTES de mandar el
  `PATCH` de cierre.
- **Una rutina puede estar asignada a varios clientes a la vez** (funciona como
  plantilla). El invariante que el server hace cumplir es el inverso y solo
  ese: un cliente tiene UNA rutina activa, y asignarle una segunda da `409`.
  Como el árbol es compartido, editarlo cambia la rutina de todos los clientes
  asignados a la vez; las sesiones y el progreso, en cambio, son por usuario y
  nunca se mezclan.

---

## 3. Tipos

Copiar de `types/api.ts`. Resumen:

```ts
type UserRole = "trainer" | "client"

interface User { id: string; email: string; name: string; role: UserRole }

interface DayExercise {
  id: string; name: string; order: number; targetSets: number
  targetRestSeconds?: number | null
  targetRir?: number | null
  notes?: string | null
}

interface Day { id: string; name: string; order: number; exercises: DayExercise[] }
interface Microcycle { id: string; name: string; order: number; days: Day[] }
interface Split { id: string; name: string; description?: string | null; microcycles: Microcycle[] }

interface SetLog {
  id: string; dayExerciseId: string; setNumber: number
  actualReps?: number | null
  actualRir?: number | null
  weight?: number | null
  completed: boolean
}

interface WorkoutSession {
  id: string; dayId: string; performedAt: string   // ISO 8601
  notes?: string | null
  setLogs: SetLog[]
}

interface LoginResponse { accessToken: string; user: User }
interface LoginPayload { email: string; password: string }
interface SplitPayload { name: string; description?: string }
interface MicrocyclePayload { name: string; order: number }
interface DayPayload { name: string; order: number }
interface DayExercisePayload {
  name: string; order: number; targetSets: number
  targetRestSeconds?: number; targetRir?: number; notes?: string
}
interface SetLogUpsert {
  dayExerciseId: string; setNumber: number
  actualReps?: number; actualRir?: number; weight?: number
  completed: boolean
}
interface SetLogPatch {
  actualReps?: number; actualRir?: number; weight?: number; completed?: boolean
}
```

`order` es un entero para ordenar; el frontend ordena por él (`a.order - b.order`).

---

## 4. Lo que queda abierto

**Cerrado en la ronda del 7 de septiembre de 2026.** El backend resolvió los
tres puntos que venían de la ronda anterior:

- **Alcance de las sesiones.** Los dos GET aplican ahora el mismo criterio —el
  dueño, o el entrenador del dueño—, así que el detalle ya no entrega una sesión
  ajena por tener su id. De paso, el historial dejó de depender de la asignación
  vigente: desasignar a un cliente ya no le devuelve 403 sobre sus propias
  sesiones viejas.
- **Una sesión cerrada es inmutable.** Los tres endpoints de series responden
  409 sobre una sesión con `completedAt`, igual que `DELETE /sessions/:id`.
  Corregir sigue siendo posible reabriendo, que es un acto explícito.
- **Una rutina puede tener varios clientes**, y ahora está escrito: funciona
  como plantilla, y el invariante que el server hace cumplir es solo el inverso.

Lo que sigue abierto:

**Cerrado: escribir en nombre de un cliente ya no existe.** El criterio de
lectura —el dueño, o el entrenador del dueño— había quedado aplicado también a
las escrituras. Ya no: **el entrenador LEE el historial de su cartera y no
escribe en él.** Con su token, sobre una sesión de su cliente:

```
GET    /sessions/:id            → 200   leer sigue igual
GET    /days/:dayId/sessions    → 200   con ?userId= también

PUT    /sessions/:id/set-logs   → 403   "Solo quien entrenó puede modificar esta sesión"
PATCH  /sessions/:id            → 403   cerrar, reabrir o editar la nota
DELETE /sessions/:id            → 403
PATCH  /set-logs/:id            → 403
DELETE /set-logs/:id            → 403
```

El motivo: `SetLog` no guarda autor, así que una serie cargada por el entrenador
es indistinguible de una que cargó quien entrenó, y la progresión la toma como
medición del cliente. Lo mismo con el cierre —`completedAt` es la marca de
"esto ya es una medición hecha"— y con la nota del día, que la escribe quien
entrenó.

El 403 de escritura trae un mensaje propio, distinto del genérico "Sin permiso
para esta sesión": ahí el problema no es de quién es la sesión, sino que sobre
las ajenas solo se puede mirar.

Si en algún momento se quiere de verdad, primero hay que decidir quién queda
como autor y guardarlo en la fila.

**➜ `JWT_EXPIRES_IN` se puede bajar a `15m`.** El interceptor de `lib/api.ts` ya
canjea el refresh ante un 401 y repite el request; solo si el canje falla borra
la sesión. El canje va detrás de `navigator.locks` y, con el lock tomado, mira
si la cookie ya cambió antes de mandar nada — sin eso, dos pestañas que vencen
al mismo tiempo canjearían el mismo refresh, y el segundo sería un reuso.

Verificado que el reuso revoca **todos los refresh** del usuario. Los access
tokens ya emitidos, en cambio, sobreviven hasta vencer: son stateless, y matarlos
al instante es algo que solo hace `logout-all`. Con `15m` esa diferencia deja de
importar; con `7d`, no.

---

## 5. Sobre seguridad, para no arrastrar el atajo del mock

`proxy.ts` (el middleware de Next) **solo chequea que la cookie exista**, y así
tiene que quedarse: es un redirect barato para no pintar el shell de la app a
quien no inició sesión, no una autenticación. La validación real la hace el
backend en cada request, y el interceptor de `lib/api.ts` limpia la sesión ante
cualquier 401.

Nada en la app trata la cookie como prueba de identidad: el usuario y su rol
salen siempre de `GET /auth/me`. Los dos tokens viven en cookies no httpOnly
—`fitfront_token` y `fitfront_refresh`, ver `lib/auth.ts`— y se borran juntos:
dejar vivo el refresh después de un logout sería peor que no tenerlo.

Las credenciales de desarrollo viven en la seed del backend y **no deben migrar**
a producción.
