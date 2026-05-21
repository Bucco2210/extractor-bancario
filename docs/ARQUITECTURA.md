# Arquitectura — B&B Tech

> Estado al cierre de Fase 8 (pulido). Refleja todo lo construido en
> las fases 1-7 + 9 + 8. La especificación funcional es
> `prompt-claude-code-extractos-bancarios-v4.md`.

## Visión general

Aplicación full-stack Next.js 15 (App Router, runtime nodejs) que:

1. **Recibe** un PDF / XLSX / CSV de extracto bancario o billetera.
2. **Detecta** el banco/billetera con OpenAI (top-N candidatos por
   score) y arma una **huella** SHA-256 del documento.
3. **Extrae** los movimientos: regla determinística (regex) si hay una
   activa para esa huella; OpenAI con chunking + persistencia
   incremental en caso contrario.
4. **Persiste** la extracción en MongoDB; **cifra** campos sensibles
   con AES-256-GCM.
5. **Concilia** contra una segunda fuente (CSV/XLSX): parser con
   auto-mapeo de columnas, matcheador determinístico 1:1 con
   tolerancias, grupos manuales 1:N/N:1.
6. **Exporta** a Excel (movimientos o resultados de conciliación).
7. **Gobierna** el acceso con planes USD (Trial/Plus/Pro/Premium), un
   `plan-gate` que limita por ciclo y un panel admin para
   invitaciones, pagos y métricas.

Multiusuario con Auth.js v5; roles `admin` / `operador`. Acceso solo
por invitación (token único + expiración).

---

## Capas

```
┌────────────────────────────────────────────────────────────────┐
│ UI — React 19 + Tailwind v4 + shadcn/ui                        │
│  app/(ui)/page.tsx           → Home (banner ciclo + tabs)      │
│  app/(ui)/workspace/...      → pestañas tipo navegador         │
│  app/(ui)/extracciones/[id]  → detalle standalone con polling  │
│  app/(ui)/conciliacion/...   → listado + doble panel           │
│  app/(ui)/formatos/...       → editor de reglas (admin)        │
│  app/(ui)/cuenta/...         → plan + uso + KPIs personales    │
│  app/(ui)/admin/...          → dashboard + usuarios + pagos    │
│  app/(ui)/registro/[token]   → aceptar invitación (público)    │
│  app/(ui)/login/...          → planes + form (público)         │
│  app/components/ui/ToggleTema → modo claro/oscuro/sistema      │
│  app/stores/workspace.ts     → Zustand + persist + sync Mongo  │
├────────────────────────────────────────────────────────────────┤
│ API Routes — runtime nodejs                                    │
│  Extracciones                                                  │
│   POST  /api/extracciones                 (plan-gate)          │
│   GET   /api/extracciones/[id]                                 │
│   PATCH /api/extracciones/[id]            (asignar perfilId)   │
│   POST  /api/extracciones/[id]/reanudar                        │
│   GET   /api/extracciones/[id]/excel                           │
│  Perfiles                                                      │
│   GET/POST /api/perfiles                  (POST=admin)         │
│   GET/PATCH/DELETE /api/perfiles/[id]                          │
│   POST /api/perfiles/detectar                                  │
│  Formatos aprendidos                                           │
│   GET /api/formatos                                            │
│   GET/PATCH/DELETE /api/formatos/[id]     (PATCH/DELETE=admin) │
│   POST /api/formatos/[id]/probar                               │
│  Conciliaciones                                                │
│   GET/POST /api/conciliaciones            (POST plan-gate)     │
│   GET/PATCH/DELETE /api/conciliaciones/[id]                    │
│   GET /api/conciliaciones/[id]/excel                           │
│  Home & usuarios                                               │
│   GET /api/home/resumen                                        │
│   POST/DELETE /api/usuarios/favoritos                          │
│   GET/PUT /api/usuarios/pestanas                               │
│   GET /api/usuarios/me/plan                                    │
│  Admin                                                         │
│   GET /api/admin/usuarios                                      │
│   POST /api/admin/usuarios/invitar                             │
│   PATCH/DELETE /api/admin/usuarios/[id]                        │
│   GET/POST /api/admin/pagos                                    │
│   GET /api/admin/metricas                                      │
│  Auth                                                          │
│   * /api/auth/[...nextauth]                                    │
│   POST /api/auth/aceptar-invitacion       (público)            │
│  Jobs durables                                                 │
│   * /api/inngest                                               │
│  Pagos                                                         │
│   POST /api/pagos/mercadopago/webhook     (público + HMAC)     │
├────────────────────────────────────────────────────────────────┤
│ Library — app/lib/* (server-only salvo helpers puros)          │
│  · plan-gate.ts        gate por plan/ciclo antes de creación   │
│  · planes.ts           matriz comercial (puro, importable      │
│                        desde client)                           │
│  · detector-perfil.ts  OpenAI scoring top-N candidatos         │
│  · huella.ts           SHA-256 de primeras N líneas norm.      │
│  · aprendizaje.ts      upsert FormatoAprendido + stats         │
│  · regla-determinista  regex con grupos nombrados + matchRate  │
│  · extraccion-runner   chunking + OpenAI + persistencia        │
│  · pdf.ts              pdfjs-dist legacy, valida suficiencia   │
│  · openai.ts           cliente + chunking + parse JSON         │
│  · conciliacion-*      parser CSV/XLSX + matcheador greedy     │
│  · cifrado.ts          AES-256-GCM idempotente                 │
│  · inngest.ts          cliente + dispararExtraccion()          │
│  · mercado-pago.ts     parse firma + HMAC + normalizar payment │
│  · tema.ts             puro, helpers de modo oscuro            │
│  · kpis-usuario.ts     agregados para /cuenta y banner Home    │
│  · home-resumen.ts     payload de /api/home/resumen            │
│  · blob.ts             abstracción storage (memoria o Vercel)  │
│  · auth.ts             NextAuth v5 + session callbacks         │
│  · permisos.ts         requerirSesion(), requerirRol()         │
│  · errors.ts           AppError + respuestaError(HTTP map)     │
│  · env.ts              zod parse de process.env + cache        │
│  · mongo.ts            conexión cacheada en globalThis         │
├────────────────────────────────────────────────────────────────┤
│ Modelos Mongoose — app/models/*                                │
│  Usuario, Extraccion, PerfilExtraccion, FormatoAprendido,      │
│  Conciliacion, Pago, Invitacion                                │
├────────────────────────────────────────────────────────────────┤
│ Infra externa                                                  │
│  MongoDB (Atlas o local), Vercel Blob (o storage en memoria    │
│  en dev), OpenAI, Inngest (cloud o dev-server), Mercado Pago   │
│  (detrás de flag)                                              │
└────────────────────────────────────────────────────────────────┘
```

---

## Flujo de una extracción (camino feliz)

```
1. cliente arrastra un PDF al DropzoneRapido (o lo sube desde
   PanelProducto con un perfilId fijado)
   │
2. POST /api/extracciones (multipart form)
   ├─ plan-gate: bootstrap a trial / rotación de ciclo / verifica
   │  límite. Si está al tope → 429 LIMITE_EXCEDIDO
   ├─ persiste extracción `pendiente` + sube el archivo al blob
   │
3. POST a Inngest: evento `extraccion.procesar`
   │  (idempotente: chunks ya hechos no se re-procesan)
   ▼
4. Inngest → POST /api/inngest → procesarExtraccionFn
   └─ correrExtraccion():
      ├─ pdf.ts: extrae texto por página
      ├─ huella.ts: SHA-256 de primeras N líneas normalizadas
      ├─ regla-determinista: si hay regla activa + matchRate>=umbral
      │    → guarda fuente="regla", listo
      │  (si no, fallback IA)
      ├─ extraccion-runner: chunking server-side
      │    persistencia incremental por chunk (_meta.chunksCompletados[])
      ├─ cifrado.ts: cifra titular, cuenta y descripciones sensibles
      └─ aprendizaje.ts: upsert FormatoAprendido al cerrar OK
   │
5. front polea `GET /api/extracciones/[id]` cada 2s
   ▼
6. UI muestra "Extracción lista" + link a Excel/conciliación
```

Idempotencia: si Inngest reintenta el job, los chunks ya hechos
se saltean (matcheo por `extraccionId` + idx). Ver `docs/INNGEST.md`.

---

## Plan-gate (`app/lib/plan-gate.ts`)

Corre antes de cualquier trabajo pesado en:
- `POST /api/extracciones`
- `POST /api/conciliaciones`

Reglas, en orden:

1. `rol === "admin"` → pasa sin chequeo.
2. Usuario sin `planInfo` (legacy / pre-Fase 9) → bootstrap a Trial.
3. `Date.now() > planInfo.cicloFin`:
   - Trial → `estadoCuenta="vencida"` + 429 modo lectura.
   - Plan pago → rota ventana (`cicloInicio=now`, `cicloFin=calcularFinCiclo`)
     y resetea contadores.
4. `estadoCuenta ∈ {vencida, suspendida}` → 429 modo lectura.
5. `extraccionesEnPeriodo >= limite` → 429 LIMITE_EXCEDIDO.
6. `$inc` atómico del contador. Si dos requests entran al borde se
   permite +1-2 sobre el límite; el siguiente bloquea.

Ver `docs/MONETIZACION.md` para la matriz de planes.

---

## Modelo de datos (resumen)

| Modelo | Colección | Notas |
|---|---|---|
| `Usuario` | `usuarios` | email único, `planInfo` embebido (plan, ciclo, contadores, estadoCuenta), `preferencias` (favoritos, pestañas). |
| `Extraccion` | `extracciones` | `usuarioId`+`createdAt` indexado, `_meta.chunksCompletados[]` para idempotencia, `_meta.tokensInput/Output` para costos, `huella` indexado, `fuente: "regla"\|"openai"`. Campos sensibles cifrados. |
| `PerfilExtraccion` | `perfilesExtraccion` | 17 entidades seed (12 bancos + 5 billeteras). `tipoDocumento` (extracto / tarjeta_credito / tarjeta_debito), `monedaPrimaria`. |
| `FormatoAprendido` | `formatosAprendidos` | `huella` único, `reglaRegex` (con grupos `fecha`/`descripcion`/`debito`/`credito`/`saldo`), `reglaActiva`, stats. |
| `Conciliacion` | `conciliaciones` | `segundaFuente` embebida (registros + mapeo + headers), `matches[]`, `descartadosExtracto[]`, `gruposManuales[]`, `estadisticas`. |
| `Pago` | `pagos` | `fuente: "manual"\|"mercadopago"`, idempotencia por `(fuente, mpPaymentId)` con índice sparse. |
| `Invitacion` | `invitaciones` | `token` único (64 chars hex), `expiraEn`, `usadaEn`, `planSugerido`. |

---

## Seguridad

- **Auth.js v5** con adapter custom + credenciales (`app/lib/auth.ts`).
  Bcrypt 12 rounds para passwords (`app/lib/password.ts`).
- **`proxy.ts`** (middleware) gatea todas las rutas excepto:
  `/login`, `/registro/<token>`, `/api/auth/*`, `/api/inngest`,
  `/api/pagos/mercadopago/webhook` (HMAC firma reemplaza sesión).
- **Roles** (`app/lib/permisos.ts`): `admin` puede tocar perfiles,
  formatos, panel admin; `operador` solo lectura + crear su propio
  contenido.
- **Cifrado en reposo** con AES-256-GCM (`app/lib/cifrado.ts`,
  `APP_ENCRYPTION_KEY` 32 bytes hex). Idempotente: cifrar un valor
  ya cifrado lo deja igual. Aplica a `titular`, `cuenta` y
  descripciones de movimientos.
- **HMAC del webhook MP** (`verificarFirmaWebhook`) usa
  `timingSafeEqual` para evitar timing attacks.

---

## Performance

- **Mongo cacheado** en `globalThis` (`app/lib/mongo.ts`) para no
  agotar pools en cold-starts serverless.
- **Chunking server-side** (`EXTRACCION_PAGINAS_POR_CHUNK`,
  `EXTRACCION_CHUNKS_PARALELO`) para PDFs largos (Provincia 60+
  páginas, etc).
- **Persistencia incremental** por chunk en `_meta.chunksCompletados[]`
  permite reanudar tras kill / restart sin reprocesar.
- **Reglas determinísticas** evitan llamadas a OpenAI cuando ya hay
  un formato aprendido para esa huella.
- **Workspace store** con `persist` (localStorage) + debounce 500ms
  al sync con Mongo.
- **Conexión Mongoose** cacheada para cold-start corto.

---

## Frontend

- **Tailwind v4** + variables CSS oklch en `globals.css` para temas
  claro/oscuro (`:root` y `.dark`).
- **shadcn/ui base-nova** con identidad B&B Tech (Funnel Display,
  degradé celeste de fondo).
- **Modo oscuro** vía `app/lib/tema.ts` + `<ToggleTema />` cíclico
  (system → light → dark). Script anti-flash en `<head>` aplica
  la clase `.dark` antes del primer paint. Ver "Modo oscuro" en
  README.
- **Zustand** con `persist` (`app/stores/workspace.ts`) + sync a
  Mongo (`useWorkspaceSync`).
- **Polling** de extracciones en proceso cada 2s desde la vista de
  detalle / workspace.

---

## Deploy

Por decisión vigente, **deploy a Vercel pausado**. Iteramos solo
local; cierre de fase = `lint + typecheck + test + build` local.
Cuando se reactive, ver `docs/DEPLOY_VERCEL.md`.

---

## Tests

Vitest puro (no JSX rendering). 420 tests al cierre de Fase 8,
cobertura sobre `app/lib/**` + `app/api/**/route.ts` + `app/models/**`
~73%. Patrón estándar: mockear `auth`, `conectarMongoose`, modelos
con `importOriginal` cuando exportan constants compartidas.

Tests separados por área (ver `tests/`):
- `tema.test.ts`, `kpis-usuario.test.ts` (fase 8)
- `planes.test.ts`, `plan-gate.test.ts`, `api-admin.test.ts`,
  `mercado-pago.test.ts`, `api-mercado-pago-webhook.test.ts` (fase 9)
- `inngest-*.test.ts`, `cifrado.test.ts` (fase 7)
- `conciliacion-*.test.ts`, `conciliaciones-schema.test.ts` (fase 6)
- `regla-determinista.test.ts`, `huella.test.ts`, `formatos-*.test.ts` (fase 5)
- `workspace-store.test.ts` (fase 4)
- `home-*.test.ts` (fase 3)
- `perfiles-*.test.ts`, `detector-parser.test.ts` (fase 2)
- `extraccion-runner.test.ts`, `chunking.test.ts`, `openai-parser.test.ts`,
  `env.test.ts`, `errors.test.ts`, `permisos.test.ts`,
  `password.test.ts`, `colores-entidad.test.ts`, `serializers.test.ts`,
  `modelos.test.ts` (fase 1 + transversales)
