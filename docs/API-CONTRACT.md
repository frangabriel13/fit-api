# Contrato de API — FitFront

Este documento describe **la API que el frontend ya espera**. No es una
propuesta: cada endpoint, path y forma de respuesta está extraído del código
que ya existe en `hooks/` y `types/api.ts`. Si el backend cumple esto, el
frontend funciona sin tocar una línea.

**Fuente de verdad de los tipos:** `types/api.ts` del repo del frontend.
Copiarlo tal cual y derivar de ahí los DTOs de NestJS es lo más seguro.

---

## 0. Cómo se conecta el frontend

Hoy el frontend corre contra una capa de mocks. Para apuntarlo al backend real,
en `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000   # base de la API
NEXT_PUBLIC_USE_MOCKS=false                 # apaga los mocks
```

Con `false`, `lib/mocks/` deja de interceptar y todas las llamadas salen a
`NEXT_PUBLIC_API_URL`. La capa de mocks (`lib/mocks/auth-mock.ts`) es una
implementación de referencia del contrato: sirve para comparar formas de
respuesta.

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

`POST /auth/login` con credenciales inválidas → **401**.

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

### Días

| método | path | body | respuesta |
|---|---|---|---|
| `POST` | `/microcycles/:microcycleId/days` | `DayPayload` | `Day` |
| `PATCH` | `/days/:id` | `Partial<DayPayload>` | `Day` |
| `DELETE` | `/days/:id` | — | — |

### Ejercicios del día

| método | path | body | respuesta |
|---|---|---|---|
| `POST` | `/days/:dayId/exercises` | `DayExercisePayload` | `DayExercise` |
| `PATCH` | `/exercises/:id` | `Partial<DayExercisePayload>` | `DayExercise` |
| `DELETE` | `/exercises/:id` | — | — |

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

## 4. Lo que TODAVÍA no tiene contrato

El frontend tiene **dos realidades** (ver `CLAUDE.md`):

1. **Cableada a la API** — `/splits/*`: editor de rutinas y modo entrenamiento.
   Es todo lo de arriba.
2. **Mock, sin backend** — `/rutina`, `/rutina/entrenar` y `/progreso` leen
   datos hardcodeados de `lib/routine-data.ts`.

Esa segunda reunión de pantallas es la más nueva y la mejor diseñada, y usa
conceptos que **el contrato actual no cubre**:

- **Macrociclo / semanas.** `MACROCYCLE = { week, totalWeeks }` y un historial
  por ejercicio con una entrada por semana completada. Hoy no hay endpoint.
- **Superseries.** Ejercicios encadenados que comparten número de planilla
  (04A + 04B). En el mock es un campo `superset?: string` que agrupa
  consecutivos. `DayExercise` no lo tiene.
- **Reps y RIR como rango en texto** (`"10 a 12"`, `"1 a 0"`, `"0 o fallo"`) y
  descanso como texto (`"4'"`, `"90''"`). El contrato actual usa números
  (`targetSets`, `targetRir`, `targetRestSeconds`).

**Decidir esto es parte del trabajo de backend.** Lo razonable es extender
`DayExercise` (rangos objetivo + `supersetId`) y agregar un endpoint de
historial por ejercicio, en vez de crear un modelo paralelo. Si cambiás
`types/api.ts`, avisá: el frontend se adapta.

---

## 5. Sobre seguridad, para no arrastrar el atajo del mock

Hoy `proxy.ts` (el middleware de Next) **solo chequea que la cookie exista**, no
que el token sea válido. Es un atajo del período sin backend. Con la API real,
la validación tiene que estar del lado del backend en cada request — el
frontend ya está preparado: cualquier 401 limpia la sesión.

Las credenciales mock de `lib/mocks/auth-mock.ts` son de desarrollo y **no
deben migrar** a ninguna seed de producción.
