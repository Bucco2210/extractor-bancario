# Arquitectura — ETHOS Extractor Bancario

> Estado: Fase 1 (MVP local). Las secciones marcadas como **pendiente** se completan en fases posteriores.

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
│  POST /api/extracciones           → upload + extracción    │
│  GET  /api/extracciones/[id]/excel → export XLSX           │
│  /api/auth/[...nextauth]          → Auth.js handlers       │
├────────────────────────────────────────────────────────────┤
│ Middleware                                                 │
│  middleware.ts → redirige a /login si no hay sesión        │
├────────────────────────────────────────────────────────────┤
│ Lógica (app/lib)                                           │
│  env.ts       → validación zod de env vars (cached)        │
│  mongo.ts     → conexiones Mongoose y MongoClient cacheadas│
│  auth.ts      → NextAuth v5 + adapter Mongo + credentials  │
│  openai.ts    → cliente OpenAI + extracción + parser       │
│  pdf.ts       → extracción de texto con pdfjs legacy       │
│  blob.ts      → abstracción de storage (impl en memoria)   │
│  excel.ts     → export XLSX con exceljs                    │
│  password.ts  → bcrypt hash/verify                         │
│  logger.ts    → pino                                       │
│  errors.ts    → AppError + respuestaError(NextResponse)    │
├────────────────────────────────────────────────────────────┤
│ Modelos (app/models, Mongoose)                             │
│  Usuario, PerfilExtraccion (stub), Extraccion              │
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
| `estado` | `"pendiente" \| "extraido" \| "error"` | |
| `movimientos[]` | `{fecha, descripcion, referencia, debito, credito, saldo}` | |
| `archivo` | `{nombre, tamano, contentType, blobKey, blobUrl}` | |
| `_meta` | `{modelo, tokensInput, tokensOutput, tiempoMs}` | |

### `perfilesExtraccion` (stub Fase 1)

Solo `slug`, `nombre`, `categoria`, `producto`, `promptSistema`, `activo`. Se expande en Fase 2.

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
  │ 4. extraerTextoPdf(buffer)        ← pdfjs legacy
  │ 5. tieneTextoSuficiente?          ← rechaza escaneados (NO_PROCESABLE)
  │ 6. blob.subir()                   ← memoria por ahora
  │ 7. extraerMovimientos(texto)      ← OpenAI chat.completions JSON
  │ 8. Extraccion.create({...})       ← Mongo
  │
  ▼
{id, cuenta, periodo, titular, movimientos[], _meta}
```

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

## Pendientes para fases siguientes

- **Fase 2**: prompts por perfil + 17 seeds + detector de perfil.
- **Fase 3**: Home con tabs de bancos, sub-tabs por producto, favoritos.
- **Fase 4**: workspace con pestañas tipo navegador.
- **Fase 5**: aprendizaje de formato + reglas determinísticas.
- **Fase 6**: conciliación con segunda fuente.
- **Fase 7**: OCR (OpenAI vision), Inngest, encriptación AES-GCM con `APP_ENCRYPTION_KEY`, tests ≥ 70%.
- **Fase 8**: dashboard de KPIs, modo oscuro, documentación final.
