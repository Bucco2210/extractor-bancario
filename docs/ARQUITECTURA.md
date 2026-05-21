# Arquitectura — B&B Tech

> Estado: Fase 5 (aprendizaje de formato + reglas determinísticas + UI /formatos). Las secciones marcadas como **pendiente** se completan en fases posteriores.

## Visión general

Aplicación full-stack Next.js (App Router) que:

1. Recibe un PDF de extracto bancario o de billetera virtual.
2. Extrae el texto con `pdfjs-dist`.
3. Envía el texto a OpenAI con un prompt que devuelve JSON estructurado de movimientos.
4. Persiste la extracción en MongoDB.
5. Permite exportar a Excel (`exceljs`).

En Fase 1 todo corre local. La integración con Vercel + Vercel Blob queda para una fase posterior.

---

## Capas

```
┌────────────────────────────────────────────────────────────┐
│ UI (React 19 + Tailwind v4 + shadcn/ui base-nova)          │
│  app/(ui)/page.tsx           → Home (tabs + grid + carrusel)│
│  app/(ui)/workspace/page.tsx → Workspace con pestañas       │
│  app/(ui)/extracciones/[id]  → vista de detalle standalone  │
│  app/(ui)/formatos/page.tsx  → UI de formatos aprendidos    │
│  app/(ui)/login/...          → Login con Auth.js v5         │
│  app/components/home/...     → Home, dropzone, tabs, panel  │
│  app/components/workspace/...→ Workspace, bar, selector     │
│  app/components/formatos/... → editor de reglas             │
│  app/components/extracciones → EstadoExtraccion (polling)   │
│  app/components/ui/...       → shadcn primitives            │
│  app/stores/workspace.ts     → Zustand store + persist      │
├────────────────────────────────────────────────────────────┤
│ API Routes (Next.js, runtime nodejs)                       │
│  POST /api/extracciones                → upload + detector  │
│  GET  /api/extracciones/[id]           → estado/polling     │
│  PATCH /api/extracciones/[id]          → asignar perfilId   │
│  POST /api/extracciones/[id]/reanudar  → reintentar chunks  │
│  GET  /api/extracciones/[id]/excel     → export XLSX        │
│  GET  /api/perfiles                    → list con filtros   │
│  POST /api/perfiles                    → create (admin)     │
│  GET  /api/perfiles/[id]               → detalle            │
│  PATCH /api/perfiles/[id]              → update (admin)     │
│  DELETE /api/perfiles/[id]             → soft delete (admin)│
│  POST /api/perfiles/detectar           → detector standalone│
│  GET  /api/home/resumen                → bancos + últimos   │
│  POST /api/usuarios/favoritos          → marcar favorito    │
│  DELETE /api/usuarios/favoritos        → desmarcar          │
│  GET  /api/usuarios/pestanas           → hidratar workspace │
│  PUT  /api/usuarios/pestanas           → persistir pestañas │
│  GET  /api/formatos                    → list formatos      │
│  GET  /api/formatos/[id]               → detalle            │
│  PATCH /api/formatos/[id]              → editar regla (admin)│
│  DELETE /api/formatos/[id]             → soft delete (admin)│
│  POST /api/formatos/[id]/probar        → probar regex       │
│  /api/auth/[...nextauth]               → Auth.js handlers   │
├────────────────────────────────────────────────────────────┤
│ Middleware                                                 │
│  middleware.ts → redirige a /login si no hay sesión        │
├────────────────────────────────────────────────────────────┤
│ Lógica (app/lib)                                           │
│  env.ts             → validación zod de env vars (cached)  │
│  mongo.ts           → Mongoose + MongoClient cacheados     │
│  auth.ts            → NextAuth v5 + adapter Mongo          │
│  permisos.ts        → requerirSesion / requerirRol         │
│  openai.ts          → cliente OpenAI + extracción + parser │
│  detector-perfil.ts → detector de perfil (IA + parser)     │
│  perfiles-schema.ts → zod schemas perfiles CRUD            │
│  perfiles-serializer.ts → DTO de PerfilExtraccion          │
│  huella.ts          → SHA-256 de líneas normalizadas       │
│  regla-determinista.ts → aplicar regex línea-por-línea     │
│  aprendizaje.ts     → upsert FormatoAprendido + stats      │
│  formatos-schema.ts → zod schemas formatos CRUD            │
│  formatos-serializer.ts → DTO de FormatoAprendido          │
│  home-resumen.ts    → armado del payload de /home/resumen  │
│  home-tipos.ts      → tipos compartidos UI/server + filtros│
│  colores-entidad.ts → paleta + iniciales para avatars      │
│  seeds/perfiles.ts  → catálogo seed (17 entidades)         │
│  pdf.ts             → extracción de texto con pdfjs legacy │
│  blob.ts            → abstracción de storage (memoria)     │
│  excel.ts           → export XLSX con exceljs              │
│  password.ts        → bcrypt hash/verify                   │
│  logger.ts          → pino                                 │
│  errors.ts          → AppError + respuestaError            │
├────────────────────────────────────────────────────────────┤
│ Modelos (app/models, Mongoose)                             │
│  Usuario, PerfilExtraccion, Extraccion, FormatoAprendido   │
├────────────────────────────────────────────────────────────┤
│ Persistencia                                               │
│  MongoDB local o Atlas (MONGODB_URI)                       │
│  Blob en memoria (luego: Vercel Blob)                      │
└────────────────────────────────────────────────────────────┘
```

---

## Modelos (Fase 1)

### `usuarios`

| Campo | Tipo | Notas |
|---|---|---|
| `email` | string único | lowercase |
| `nombre` | string | |
| `passwordHash` | string | bcrypt 12 rounds |
| `rol` | `"admin" \| "operador"` | |
| `activo` | boolean | |
| `preferencias.perfilFavorito` | string | Fase 3 |
| `preferencias.bancosFavoritos` | string[] | Fase 3 |
| `preferencias.pestanasAbiertas` | array | Fase 4 |

### `extracciones`

| Campo | Tipo | Notas |
|---|---|---|
| `usuarioId` | ObjectId | índice |
| `banco`, `cuenta`, `periodo`, `titular` | string \| null | |
| `estado` | `"pendiente" \| "extraido" \| "parcial" \| "error"` | `parcial` si algún chunk falló |
| `movimientos[]` | `{fecha, descripcion, referencia, debito, credito, saldo}` | |
| `archivo` | `{nombre, tamano, contentType, blobKey, blobUrl}` | |
| `_meta` | `{modelo, tokensInput, tokensOutput, tiempoMs, chunksTotal, chunksOk, chunksFallidos[]}` | |

### `perfilesExtraccion` (Fase 2)

| Campo | Tipo | Notas |
|---|---|---|
| `slug` | string único | `^[a-z0-9_]+$`, ej. `galicia_extracto_ars` |
| `entidad.slug` | string | clave de la entidad madre (banco/billetera) |
| `entidad.nombre` | string | display ("Banco Galicia") |
| `entidad.iconoUrl` | string \| null | reservado para Fase 3 |
| `categoria` | `"banco" \| "billetera"` | tab de capa 1 en el Home |
| `nombre` | string | display del perfil ("Extracto CA ARS") |
| `tipoDocumento` | `"extracto_bancario" \| "tarjeta_credito" \| "tarjeta_debito"` | |
| `monedaPrimaria` | `"ARS" \| "USD"` | |
| `promptSistema` | string | prompt específico del perfil (vacío por default) |
| `huella.palabrasClave` | string[] | input del detector |
| `validacionesEspeciales` | `{tipo, valor, descripcion}[]` | validaciones declarativas |
| `ordenEnGrid` | number | orden visual |
| `activo` | boolean | soft delete |

Catálogo inicial (12 bancos + 5 billeteras) en `app/lib/seeds/perfiles.ts`. Se carga
con `npm run seed:perfiles` — el script es idempotente (upsert por slug). Ver
[docs/PERFILES_EXTRACCION.md](./PERFILES_EXTRACCION.md) para el listado completo
y cómo agregar más.

---

## Flujo de extracción

```
Usuario
  │
  │ 1. Sube PDF + (opcional) banco
  ▼
POST /api/extracciones
  │
  │ 2. Valida auth, MIME, tamaño
  │ 3. Lee el File a Buffer (memoria)
  │ 4. extraerTextoPdf(buffer)             ← pdfjs legacy
  │ 5. tieneTextoSuficiente?               ← rechaza escaneados (NO_PROCESABLE)
  │ 6. blob.subir()                        ← memoria por ahora
  │ 7. extraerMovimientosDeChunks({...})   ← chunking server-side
  │     │
  │     ├─ partirEnChunks(paginas, N=6)         ← env EXTRACCION_PAGINAS_POR_CHUNK
  │     ├─ ejecutarConPool(chunks, C=3, …)     ← env EXTRACCION_CHUNKS_PARALELO
  │     │    para cada chunk: OpenAI JSON → MovimientoExtraido[]
  │     ├─ agrega resultados respetando orden
  │     └─ devuelve { resultado, meta+chunksOk+chunksFallidos[] }
  │ 8. Decide estado: "extraido" | "parcial" | (lanza si nada extrajo)
  │ 9. Extraccion.create({...})            ← Mongo
  │
  ▼
{id, estado, cuenta, periodo, titular, movimientos[], _meta}
```

### Chunking de extractos largos

Provincia, Galicia y otros bancos pueden tener 60+ páginas. Para evitar
timeouts y respuestas truncadas del modelo, el server divide el documento
en bloques (default: 6 páginas) y los procesa en paralelo (default: 3 a
la vez). Si un bloque falla, los demás siguen y el documento queda con
`estado: "parcial"` + lista de bloques fallidos en `_meta.chunksFallidos`.

Ajustable por env: `EXTRACCION_PAGINAS_POR_CHUNK`, `EXTRACCION_CHUNKS_PARALELO`.

Errores HTTP:
- 400 `INPUT_INVALIDO` (archivo faltante, MIME, tamaño)
- 401 `SIN_AUTH`
- 404 `NO_ENCONTRADO` (extracción)
- 422 `NO_PROCESABLE` (PDF escaneado)
- 500 `INTERNO`

---

## Autenticación

`Auth.js v5` con strategy `jwt`, credentials provider, adapter Mongo (`@auth/mongodb-adapter`).
El middleware fuerza login en todo lo que no sea `/login`, `/api/auth/*`, ni assets estáticos.
El callback `session` inyecta `id` y `rol` del usuario.

---

## Estado del cliente

Fase 1: ninguno — Server Components + `useState` local en componentes interactivos.
Fase 4: Zustand store del workspace con `persist`.

---

## Detector de perfil (Fase 2)

`POST /api/perfiles/detectar` recibe un texto (típicamente el primer
chunk del PDF) y devuelve los top-N perfiles más probables con un score
entre 0 y 1. La lista de candidatos se arma desde los perfiles activos en
Mongo, pasándole al modelo el `slug`, la entidad, la categoría y las
`huella.palabrasClave` de cada uno.

```
Cliente
  │  POST /api/perfiles/detectar  { texto, topN? }
  ▼
- requerirSesion()
- PerfilExtraccion.find({ activo: true })   ← arma candidatos
- detectarPerfil({ texto, candidatos })
    │
    ├─ OpenAI chat.completions con response_format json_object
    └─ parsearRespuestaDetector(raw, candidatos)
         ↳ descarta slugs alucinados (matching contra la lista)
         ↳ ordena por score descendente
  │
  ▼
{ mejor: {perfilId, slug, score, razones} | null,
  candidatos: [...top-N],
  _meta: { modelo, tokensInput, tokensOutput, tiempoMs, totalCandidatos } }
```

Desde Fase 3 el detector también se invoca **internamente desde
`POST /api/extracciones`** cuando el caller no pasó `perfilId`. Si
`mejor.score >= UMBRAL_AUTO_DETECCION (0.85)`, el `perfilId` se fija
antes de crear el documento. Si no, la extracción arranca igual con
`perfilId: null` y el cliente decide si pedir confirmación manual al
usuario (modal de detección dudosa en la Home).

---

## Home (Fase 3)

La pantalla de inicio (`/`) reemplaza al upload simple de Fase 1. Detalle
completo del comportamiento en [docs/HOME_UX.md](./HOME_UX.md). Resumen:

- **`GET /api/home/resumen`** arma el payload combinando perfiles
  activos (agrupados por `entidad.slug`), preferencias del usuario y
  últimas N extracciones. La lógica pura está en
  `app/lib/home-resumen.ts::armarHomeResumen` (testeada en
  `tests/home-resumen.test.ts`).
- **DropzoneRapido** sube el archivo sin `perfilId` y deja que el
  backend corra el detector. La UI redirige a `/extracciones/[id]` si
  hubo auto-detección, o abre un modal con los candidatos del detector
  cuando el score no alcanza el umbral.
- **Panel de Producto** (slide-over) ofrece dropzones por perfil de
  cada entidad — esos uploads van con `perfilId` fijado y saltean el
  detector.
- **Favoritos** vive en `usuarios.preferencias.bancosFavoritos` como
  array de `entidad.slug`. Toggle optimista con revert en falla.

## Vista de detalle de extracción

`VistaEstadoExtraccion` es el componente client que pollea
`GET /api/extracciones/:id` cada 1.5s y renderiza estado, progreso,
movimientos, errores y export Excel. Vive en
`app/components/extracciones/EstadoExtraccion.tsx`.

Se monta desde dos lugares:

- `/extracciones/[id]` — vista standalone (bookmarks, links externos).
- `/workspace` — dentro de cada pestaña, con `key={extraccionId}` para
  reiniciar el polling al cambiar de pestaña.

---

## Workspace (Fase 4)

El workspace (`/workspace`) tiene pestañas tipo navegador. Detalle
completo en [docs/WORKSPACE.md](./WORKSPACE.md). Resumen:

- **Store Zustand** (`app/stores/workspace.ts`) con `persist`
  (localStorage por máquina). El estado expuesto es
  `{ pestanas, activeId, hidratada }` con acciones puras testeables.
- **Sincronización a Mongo** (`useWorkspaceSync`) — hidrata desde
  Mongo en mount si el local está vacío; persiste con `PUT` debounced
  500 ms. El servidor recorta al `MAX_PESTANAS_ABIERTAS` y normaliza
  para que como máximo una pestaña tenga `activa: true`.
- **Una pestaña por extracción**: `abrir` dedupea por `extraccionId`.
- **Cerrar con auto-activar adyacente**: lógica pura en `reducirCerrar`.
- **Atajos**: `Cmd/Ctrl + W` cierra activa, `Cmd/Ctrl + Shift + W`
  cierra todas, `Cmd/Ctrl + 1..9` activa por posición.
- **Integración con Home**: tras upload, el redirect pasa a
  `/workspace` (en vez de `/extracciones/[id]`). La Home muestra un
  banner *"Tenés N extractos abiertos en el workspace"* cuando hay
  pestañas, y el carrusel de últimos también abre pestañas.

---

## Aprendizaje de formato (Fase 5)

`POST /api/extracciones` calcula la **huella** del PDF (SHA-256 de las
primeras N líneas normalizadas — fechas/montos/dígitos removidos). Si
hay un `FormatoAprendido` con esa huella y regla activa, intenta
extracción **determinística** con regex. Si `matchRate >= 0.8`, la
extracción cierra `fuente="regla"` sin llamar a OpenAI. Si la regla
falla, fallback al pipeline OpenAI normal y `stats.extraccionesFallidas`
del formato se incrementa.

Al cerrar OK con OpenAI, el runner hace upsert al `FormatoAprendido`
(creando el doc en blanco si recién aparece esta huella) e incrementa
`stats.extraccionesIA`. El admin puede entrar a `/formatos`, escribir
una regla regex, probarla contra una muestra de texto vía
`POST /api/formatos/[id]/probar` y activarla. La próxima extracción del
mismo formato va por la regla.

Detalle completo en [docs/APRENDIZAJE.md](./APRENDIZAJE.md).

---

## Cifrado en reposo (Fase 7)

Para proteger los datos bancarios sensibles, ciertos campos se persisten
cifrados en MongoDB usando **AES-256-GCM** con autenticación. La clave de
32 bytes se deriva de `APP_ENCRYPTION_KEY` (64 chars hex, validada en
`app/lib/env.ts`).

### Formato del ciphertext

`enc:v1:<iv_base64>:<tag_base64>:<data_base64>`

- El prefijo `enc:v1:` permite detectar valores ya cifrados y soporta
  rotación futura de algoritmo (v2, v3…).
- IV de 12 bytes aleatorio por cifrado (estándar GCM).
- El tag de autenticación detecta tampering: cualquier alteración del
  ciphertext hace que `descifrar()` tire un error.

### Campos cifrados

| Modelo | Campo | Tipo |
|---|---|---|
| `extracciones` | `cuenta` | número de cuenta / CBU |
| `extracciones` | `titular` | PII fuerte |
| `extracciones` | `movimientos[].descripcion` | detalle transaccional |
| `extracciones` | `movimientos[].referencia` | refs operaciones |
| `conciliaciones` | `segundaFuente.registros[].descripcion` | mismo motivo |
| `conciliaciones` | `segundaFuente.registros[].referencia` | idem |

**Lo que no se cifra y por qué**:
- `Usuario.email`: es clave de lookup en login.
- Importes (`debito/credito/saldo/monto`): números puros sin contexto,
  cifrar rompería agregaciones y reportes.
- `archivo.blobUrl`: la URL apunta a Vercel Blob con control de acceso
  propio; el contenido del PDF no llega a Mongo.

### Helpers (`app/lib/cifrado.ts`)

- `cifrar(s)` / `descifrar(s)`: idempotentes (cifrar dos veces no
  re-cifra; descifrar un plaintext lo devuelve igual). `null/undefined/""`
  pasan tal cual.
- `cifrarMovimiento(m)` / `descifrarMovimiento(m)`: convenience por
  campo conocido.
- `descifrarExtraccionLean(doc)` / `descifrarConciliacionLean(doc)`: para
  resultados de `.lean()`, donde los getters Mongoose no se disparan.

### Migración de datos existentes

```
npm run migrar:encriptacion -- --dry-run
npm run migrar:encriptacion
```

Idempotente: detecta documentos ya cifrados y los saltea. Hacé backup
antes de correrlo en producción.

---

## Testing

- `npm run test` corre la suite con vitest (33 archivos, 324 tests).
- `npm run test:coverage` genera reporte con `@vitest/coverage-v8` y
  enforce thresholds: lines 70%, statements 70%, functions 65%,
  branches 60%. Si baja de eso, falla en CI.
- Cobertura actual: **72.9% lines / 82.25% branches / 86.2% functions**.
- Scope medido: `app/lib/**`, `app/api/**/route.ts`, `app/models/**`.
  Excluidos del scope los adaptadores delgados a libs externas
  (`logger`, `mongo`, `blob`, `pdf`, `excel`, `auth`, `openai`,
  `utils`, `inngest-funciones`) — testearlos sería testear pino /
  mongoose / openai-sdk / pdfjs / exceljs / vercel-blob, no nuestra
  lógica.
- Patrón de tests de handlers: mockeo de Mongoose models + `auth`
  con `vi.hoisted` + `vi.mock`, sin DB real. Para los modelos con
  exports auxiliares (constants tipo `TIPOS_VALIDACION`) se reusan
  via `importOriginal` para no romper los schemas que dependen.

## Pendientes para fases siguientes

- **Fase 7 ✅ cerrada**: encriptación AES-GCM en reposo, Inngest para
  jobs durables, cobertura ≥ 70%.
- **Fase 8**: dashboard de KPIs, modo oscuro, documentación final.
- **Fase 9 (nueva)**: monetización, planes Plus/Pro/Premium, panel
  admin, login con planes, integración Mercado Pago.
