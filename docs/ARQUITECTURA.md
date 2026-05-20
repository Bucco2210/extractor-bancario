# Arquitectura — ETHOS Extractor Bancario

> Estado: Fase 2 (perfiles de extracción + detector). Las secciones marcadas como **pendiente** se completan en fases posteriores.

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
│  app/(ui)/page.tsx     → Home (upload)                     │
│  app/(ui)/login/...    → Login con Auth.js v5              │
│  app/components/...    → componentes (UploadExtracto, ui/) │
├────────────────────────────────────────────────────────────┤
│ API Routes (Next.js, runtime nodejs)                       │
│  POST /api/extracciones                → upload + extracción│
│  GET  /api/extracciones/[id]           → estado/polling     │
│  POST /api/extracciones/[id]/reanudar  → reintentar chunks  │
│  GET  /api/extracciones/[id]/excel     → export XLSX        │
│  GET  /api/perfiles                    → list con filtros   │
│  POST /api/perfiles                    → create (admin)     │
│  GET  /api/perfiles/[id]               → detalle            │
│  PATCH /api/perfiles/[id]              → update (admin)     │
│  DELETE /api/perfiles/[id]             → soft delete (admin)│
│  POST /api/perfiles/detectar           → detector con IA    │
│  /api/auth/[...nextauth]               → Auth.js handlers   │
├────────────────────────────────────────────────────────────┤
│ Middleware                                                 │
│  middleware.ts → redirige a /login si no hay sesión        │
├────────────────────────────────────────────────────────────┤
│ Lógica (app/lib)                                           │
│  env.ts            → validación zod de env vars (cached)   │
│  mongo.ts          → Mongoose + MongoClient cacheados      │
│  auth.ts           → NextAuth v5 + adapter Mongo           │
│  permisos.ts       → requerirSesion / requerirRol          │
│  openai.ts         → cliente OpenAI + extracción + parser  │
│  detector-perfil.ts→ detector de perfil (IA + parser)      │
│  perfiles-schema.ts→ zod schemas perfiles CRUD             │
│  perfiles-serializer.ts → DTO de PerfilExtraccion          │
│  seeds/perfiles.ts → catálogo seed (17 entidades)          │
│  pdf.ts            → extracción de texto con pdfjs legacy  │
│  blob.ts           → abstracción de storage (memoria)      │
│  excel.ts          → export XLSX con exceljs               │
│  password.ts       → bcrypt hash/verify                    │
│  logger.ts         → pino                                  │
│  errors.ts         → AppError + respuestaError             │
├────────────────────────────────────────────────────────────┤
│ Modelos (app/models, Mongoose)                             │
│  Usuario, PerfilExtraccion, Extraccion                     │
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

En Fase 2 el detector solo se expone como endpoint independiente —
no se cabla todavía al POST de extracción. Esa integración (auto-detección
sobre el primer chunk y redirect al workspace si `score >= 0.85`) es de
Fase 3 (DropzoneRapido).

---

## Pendientes para fases siguientes

- **Fase 3**: Home con tabs de bancos, sub-tabs por producto, favoritos, cableado del detector al upload.
- **Fase 4**: workspace con pestañas tipo navegador.
- **Fase 5**: aprendizaje de formato + reglas determinísticas.
- **Fase 6**: conciliación con segunda fuente.
- **Fase 7**: OCR (OpenAI vision), Inngest, encriptación AES-GCM con `APP_ENCRYPTION_KEY`, tests ≥ 70%.
- **Fase 8**: dashboard de KPIs, modo oscuro, documentación final.
