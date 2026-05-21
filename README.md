# B&B Tech

Sistema multiusuario de **importación, extracción inteligente, conciliación y exportación** de extractos bancarios y de billeteras virtuales (Mercado Pago, Ualá, Naranja X, Cuenta DNI, Personal Pay, etc.) construido para ETHOS Gestión Contable.

Aplicación full-stack Next.js desplegada en Vercel, con MongoDB Atlas como base de datos y OpenAI como motor de extracción.

> La especificación oficial es el documento `prompt-claude-code-extractos-bancarios-v4.md`. Este README resume el plan y refleja el estado actual del trabajo. Durante esta etapa de desarrollo el deploy a Vercel está pausado — todo se valida local con `npm run test/lint/build`.

---

## Stack tecnológico

- **Framework**: Next.js 15+ (App Router) + TypeScript estricto
- **UI**: React 19 + TailwindCSS + shadcn/ui + lucide-react
- **Estado cliente**: Zustand con `persist` para el workspace
- **Base de datos**: MongoDB Atlas + Mongoose (conexión cacheada para serverless)
- **Storage de archivos**: Vercel Blob
- **IA**: OpenAI SDK — `gpt-4o-mini` por defecto, `gpt-4o` como fallback
- **PDF**: `pdfjs-dist` legacy + `pdf-lib` (PDFs digitales — OCR/vision queda fuera del scope del proyecto)
- **Excel**: `exceljs`
- **Auth**: Auth.js v5 con adapter Mongo, roles `admin` / `operador`
- **Jobs largos**: Inngest
- **Utilidades**: `zod`, `pino`, `fast-levenshtein`

---

## Las tres capas de navegación

El sistema tiene **tres conceptos distintos de "tabs"** que cumplen funciones diferentes y no deben mezclarse:

### Capa 1 — Tabs de categoría de entidad (en la Home)
Tabs horizontales arriba del catálogo: `🏦 Bancos | 📱 Billeteras | 💳 Tarjetas | ⭐ Favoritos`. Filtran el grid de cards visibles.

### Capa 2 — Sub-tabs por tipo de producto (en el Panel de Producto)
Al hacer click en la card de un banco, se abre un slide-over con tabs internos: `Caja Ahorro ARS | Cuenta Corriente ARS | Caja Ahorro USD | Tarjeta`. **Cada tab es un perfil de extracción distinto.**

### Capa 3 — Pestañas del workspace (extractos abiertos)
Una vez subido un archivo, se abre como pestaña tipo navegador en `/workspace`. Cada pestaña = un extracto en proceso o ya extraído.

---

## Pantalla de inicio (Home)

```
┌────────────────────────────────────────────────────────────────────┐
│ B&B Tech                                 [👤 Seba] [⚙] [🌙] [👁‍🗨] │
├────────┬───────────────────────────────────────────────────────────┤
│ 🏠 Home│                                                           │
│ 📊 Dash│   Importar nuevo extracto                                 │
│ 📥 Work│                                                           │
│ 📁 Extr│   ┌──────────────────────────────────────────────────┐   │
│ ⇄ Conc│   │                                                  │   │
│ 🏛 Perf│   │      📄  Arrastrá un archivo acá                 │   │
│ 🧠 Form│   │          o hacé click para elegir                │   │
│ 📤 Expo│   │                                                  │   │
│ ⚙ Conf│   │     El sistema detecta el banco automáticamente  │   │
│        │   │     Formatos: PDF, XLSX, XLS, CSV  ·  máx 25MB   │   │
│        │   └──────────────────────────────────────────────────┘   │
│        │                                                           │
│        │   ─── o elegí el banco/billetera ────────────────────     │
│        │                                                           │
│        │   ┌─[🏦 Bancos]─[📱 Billeteras]─[💳 Tarjetas]─[⭐ Favs]┐  │
│        │   │                                                    │  │
│        │   │  🏦 Galicia    🏦 Nación      🏦 Provincia          │  │
│        │   │  🏦 Santander  🏦 BBVA        🏦 Macro              │  │
│        │   │  🏦 ICBC       🏦 HSBC        🏦 Supervielle        │  │
│        │   │  ➕ Otro banco                                      │  │
│        │   └────────────────────────────────────────────────────┘  │
│        │                                                           │
│        │   ─── últimos extractos procesados ──────────────────     │
│        │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│        │   │ Galicia  │ │ MP Cobros│ │ Ualá EC  │ │ Santander│    │
│        │   │ CA 10/25 │ │   09/25  │ │   08/25  │ │ CC 10/25 │    │
│        │   │ ✓ listo  │ │ ✓ listo  │ │ ✓ listo  │ │ ✓ listo  │    │
│        │   └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
└────────┴───────────────────────────────────────────────────────────┘
```

### Comportamiento clave

- **Dropzone rápido**: drop o click → upload → auto-detección de perfil. Si la confianza ≥ 0.85 se abre la pestaña directo en `/workspace`. Si < 0.85, modal pidiendo elegir banco manualmente.
- **Grid de cards**: cada card muestra logo, nombre, cantidad de productos y estado de aprendizaje (✓ aprendido o 🧪 sin formato aprendido). Estrella ⭐ si es favorito.
- **Panel de producto** (slide-over desde la derecha): al elegir un banco, sub-tabs con los productos asociados. El `perfilId` queda fijado por el usuario y se omite la auto-detección.
- **Carrusel de últimos extractos**: muestra hasta `HOME_MOSTRAR_ULTIMOS_N` (default 8). Click abre el extracto como pestaña en el workspace.
- **Estado vacío**: dropzone visible + mensaje *"Estos son los bancos más usados en Argentina. Tu primer extracto va a tardar un poco más porque el sistema está aprendiendo el formato. Los siguientes son instantáneos."*

---

## Plan de implementación por fases

Trabajamos **una fase por vez**, con tests al cierre, commit atómico, y verificación de deploy a Vercel.

### ✅ Fase 1 — Setup y MVP (cerrada)
- Next.js 16 + Tailwind v4 + shadcn/ui (base-nova).
- `.env.example` + validación zod en `app/lib/env.ts`.
- Conexión MongoDB cacheada para serverless.
- Auth.js v5 con login básico (rol `admin` / `operador`).
- Upload + extracción async con chunking server-side, persistencia incremental por chunk y reanudación de chunks fallidos (`POST /api/extracciones`, `GET /api/extracciones/:id`, `POST /api/extracciones/:id/reanudar`).
- Export Excel mínimo con `exceljs` (`GET /api/extracciones/:id/excel`).
- Deploy a Vercel **pausado por decisión del usuario** — validación local con tests + lint + typecheck + build.

### ✅ Fase 2 — Perfiles de extracción (cerrada)
- Modelo `PerfilExtraccion` con entidad embebida, `categoria` (`banco`/`billetera`), `tipoDocumento` (`extracto_bancario`/`tarjeta_credito`/`tarjeta_debito`), `monedaPrimaria` (`ARS`/`USD`), huella para detector y validaciones declarativas.
- 17 entidades seed (12 bancos + 5 billeteras), cada una con un perfil base de `extracto_bancario / ARS`. Script idempotente `npm run seed:perfiles`.
- Endpoints CRUD `/api/perfiles/*` (lectura para sesión, escritura solo `admin`).
- Detector con OpenAI: `POST /api/perfiles/detectar` devuelve top-N candidatos con score 0–1 y razones. Aún no cableado al upload (eso es Fase 3).

### ✅ Fase 5 — Aprendizaje de formato (cerrada)
- Huella SHA-256 de líneas normalizadas (env `APRENDIZAJE_HUELLA_LINEAS=30`): misma huella para extractos del mismo banco con datos distintos, distinta entre bancos.
- Modelo `FormatoAprendido` con `perfilId`, `huella`, `reglaRegex`, `reglaActiva`, stats (ok / IA / fallos) y notas.
- Pipeline al subir un PDF: si hay regla activa para la huella y match-rate ≥ `APRENDIZAJE_UMBRAL_MATCH_RATE` (default 0.8), persiste `fuente="regla"` directo (sin OpenAI). Si no, fallback IA y upsert del formato al cerrar.
- Endpoints `/api/formatos/*` (lectura sesión, edición admin) + `POST /[id]/probar` para validar el regex antes de activarlo.
- UI `/formatos` (admin) con lista filtrable + editor de regla + área de prueba en vivo. Vista de detalle de extracción muestra badge "Regla determinística" vs "Extracción por IA".
- 25 tests nuevos (huella estable, parser determinista AR/US, schema zod).

### ✅ Fase 4 — Workspace con pestañas (cerrada)
- Store Zustand del workspace con `persist` (localStorage) + sync a Mongo (debounced 500ms) via `useWorkspaceSync`.
- Layout `/workspace` con `WorkspaceBar` (pestañas tipo navegador + botón `+`), `SelectorPerfil` arriba del contenido, `VistaEstadoExtraccion` reusada por pestaña.
- Endpoint `GET/PUT /api/usuarios/pestanas` — el server recorta al `MAX_PESTANAS_ABIERTAS` y normaliza para que como máximo una sea `activa`.
- Atajos: `Cmd/Ctrl+W` (cerrar), `Cmd/Ctrl+Shift+W` (cerrar todas), `Cmd/Ctrl+1..9` (ir a pestaña N).
- Integración Home → workspace: dropzone/panel/carrusel/modal abren pestaña y redirigen; banner en Home con cantidad de pestañas abiertas.
- 16 tests nuevos (store puro: abrir/dedupe, cerrar/auto-activar, límite, renombrar, (de)serialización Mongo).
- Split view y reorder por drag postergados (Fase 6 / 8 respectivamente).

### ✅ Fase 3 — Home con tabs de bancos (cerrada)
- Ruta `/` con layout completo: dropzone rápido + tabs de categoría + grid de cards + carrusel últimos.
- DropzoneRapido con detector cableado al upload (`UMBRAL_AUTO_DETECCION = 0.85`).
- Slide-over `PanelProducto` con sub-tabs por perfil; uploads desde ahí van con `perfilId` fijado.
- Modal de detección dudosa cuando el score no alcanza el umbral: top-N candidatos + opción de saltar.
- Favoritos en `usuarios.preferencias.bancosFavoritos` (POST/DELETE `/api/usuarios/favoritos`, toggle optimista).
- Endpoint `GET /api/home/resumen` (lógica pura testeable en `app/lib/home-resumen.ts`).
- Vista de detalle provisoria `/extracciones/[id]` con polling (se reusa en Fase 4 dentro del workspace).
- Endpoint `PATCH /api/extracciones/[id]` para asignar `perfilId` tras el hecho (usado por el modal).

### Fase 4 — Workspace con pestañas
- Zustand store del workspace + `persist`.
- Layout `/workspace` con barra de pestañas tipo navegador.
- Componentes: pestañas, selector de perfil, split view.
- Sincronización a MongoDB (`usuarios.preferencias.pestañasAbiertas`).
- Atajos de teclado.

### Fase 5 — Aprendizaje
- Detector de formato por huella del documento.
- Generación de reglas determinísticas por formato.
- Asociación formato ↔ perfil.
- UI `/formatos` para revisar/editar reglas.

### ✅ Fase 6 — Conciliación (cerrada)
- Modelo `Conciliacion` con segundaFuente embebida (registros + mapeo + headers), matches 1:1 (con `confirmadoManualmente`), `descartadosExtracto`, `gruposManuales` (sumatorias 1:N / N:1) y estadísticas calculadas server-side.
- Parser CSV (separador auto, comillas, escape, BOM) + XLSX (`exceljs`) con auto-mapeo de columnas por sinónimos; si falta alguna requerida, devuelve **422 + headers crudos** para que el front presente un mini-mapeador y reintente con `mapeoOverride`.
- Matcheador determinístico (sin OpenAI) con score combinado `0.4·fecha + 0.3·importe + 0.3·descripción` (`fast-levenshtein`), tolerancias `(días, importe, fuzzy)` desde `.env`, comparación de importes por valor absoluto y asignación 1:1 greedy.
- Endpoints `GET/POST /api/conciliaciones`, `GET/PATCH/DELETE /api/conciliaciones/[id]`, `GET /api/conciliaciones/[id]/excel` (Resumen + Extracto + Segunda fuente + Grupos manuales).
- PATCH soporta: editar nombre/notas/tolerancias, `forzarMatch`, `quitarMatch`, `descartarExtracto`, `crearGrupoManual`, `eliminarGrupoManual`, `reMatchear` (preserva manuales y grupos).
- UI `/conciliacion` (listado) y `/conciliacion/[id]` (doble panel con selección múltiple, barra de acciones contextual, panel de tolerancias, lista de grupos manuales).
- Integración en `/extracciones/[id]` y `/workspace`: panel "Conciliaciones" con historial + botón **Conciliar / Nueva conciliación** + mini-mapeador in-line para el caso 422.
- 28 tests nuevos (parser + matcheador + cálculo de estadísticas con grupos).

### Fase 7 — Robustez
- Inngest para jobs largos.
- Encriptación de campos sensibles con `APP_ENCRYPTION_KEY`.
- Tests con cobertura ≥ 70%.
- **OCR/vision para PDFs escaneados queda explícitamente fuera del scope** — solo soportamos PDFs digitales (texto extraíble).

### Fase 8 — Pulido
- Dashboard con KPIs (cantidad de extracciones, tokens consumidos, errores).
- Modo oscuro.
- Documentación final.

---

## Variables de entorno

```bash
# === OpenAI ===
OPENAI_API_KEY=sk-...
OPENAI_MODEL_DEFAULT=gpt-4o-mini
OPENAI_MODEL_FALLBACK=gpt-4o
OPENAI_MAX_RETRIES=3
OPENAI_TIMEOUT_MS=60000

# === MongoDB Atlas ===
MONGODB_URI=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=ethos_extractos

# === Vercel Blob ===
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# === Auth.js v5 ===
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# === Encriptación de campos sensibles ===
APP_ENCRYPTION_KEY=<openssl rand -hex 32>

# === Aplicación ===
APP_NAME=B&B Tech
APP_ENV=development
LOG_LEVEL=info
MAX_FILE_SIZE_MB=25
ALLOWED_MIME_TYPES=application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv

# === Workspace ===
MAX_PESTAÑAS_ABIERTAS=15
PERSISTIR_PESTAÑAS_EN_MONGO=true

# === Home ===
HOME_MOSTRAR_ULTIMOS_N=8
HOME_BANCOS_DESTACADOS=galicia,nacion,provincia,santander,bbva,macro,icbc,mercado_pago

# === Conciliación ===
CONCILIACION_TOLERANCIA_DIAS=2
CONCILIACION_TOLERANCIA_IMPORTE_PESOS=1
CONCILIACION_FUZZY_UMBRAL=0.85

# === Jobs asíncronos ===
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# === Costos y límites ===
LIMITE_TOKENS_MENSUAL=5000000
ALERTA_TOKENS_PORCENTAJE=80
```

Todas se validan con `zod` en `app/lib/env.ts` al arrancar el servidor.

---

## Servicios externos requeridos

| Servicio | Estado | Acción |
|----------|--------|--------|
| OpenAI API | En uso | Modelo default `gpt-4o-mini`, fallback `gpt-4o` |
| MongoDB | En uso | Local en desarrollo; Atlas cuando se reactive Vercel |
| Vercel | **Pausado** | Reactivar cuando el sistema esté más maduro |
| Vercel Blob | **Pausado** | Storage local en memoria; reemplazar al volver a Vercel |
| Inngest | Diferido | Necesario recién en Fase 7 |

---

## Comandos

```bash
npm install
npm run dev               # next dev
npm run build             # next build
npm run start             # next start
npm run lint              # eslint
npm run typecheck         # tsc --noEmit
npm run test              # vitest run
npm run test:watch        # vitest --watch

npm run seed:admin        # crea/actualiza usuario admin (de variables ADMIN_SEED_*)
npm run seed:perfiles     # upsert idempotente del catálogo de 17 perfiles
```

---

## Documentación viva

Se irá completando a lo largo de las fases:

- `docs/ARQUITECTURA.md` — modelos de datos, capas, flujo de extracción.
- `docs/DEPLOY_VERCEL.md` — pasos de deploy, variables, troubleshooting.
- `docs/PERFILES_EXTRACCION.md` — catálogo de perfiles seed y cómo agregar nuevos.
- `docs/HOME_UX.md` — comportamiento detallado de la Home y las tres capas de tabs.
- `docs/WORKSPACE.md` — pestañas, store Zustand y sync a Mongo.
- `docs/APRENDIZAJE.md` — huella, reglas regex y pipeline regla-primero.
- `docs/CONCILIACION.md` — modelo `Conciliacion`, parser CSV/XLSX, matcheador, grupos manuales y UI doble panel.

---

## Estado actual

**Fases 1, 2, 3, 4, 5, 6 y 7 cerradas.** Próximo paso: Fase 9 (monetización + admin + login con planes — ver `prompt-claude-code-extractos-bancarios-v4.md`). Fase 8 (pulido / KPIs) queda en cola. OCR/vision quedó fuera del scope.

| Fase | Estado | Resultado entregado |
|---|---|---|
| 1 — Setup y MVP | ✅ Cerrada | Upload + extracción async con chunking, persistencia incremental, reanudación, export XLSX, auth credentials. |
| 2 — Perfiles de extracción | ✅ Cerrada | Modelo `PerfilExtraccion`, 17 seeds idempotentes, CRUD `/api/perfiles/*` con admin gate, detector `POST /api/perfiles/detectar`. |
| 3 — Home con tabs de bancos | ✅ Cerrada | Home `/` con dropzone + tabs + grid + slide-over + carrusel, detector cableado al upload, favoritos, vista de detalle `/extracciones/[id]`. |
| 4 — Workspace con pestañas | ✅ Cerrada | `/workspace` con pestañas tipo navegador, store Zustand + persist + sync a Mongo, atajos, integración con Home. |
| 5 — Aprendizaje | ✅ Cerrada | Huella + `FormatoAprendido` + regla regex, pipeline regla-primero con fallback IA, UI `/formatos` con editor y área de prueba. |
| 6 — Conciliación | ✅ Cerrada | Modelo `Conciliacion`, parser CSV/XLSX con auto-mapeo y 422+mini-mapeador, matcheador determinístico 1:1 con tolerancias, grupos manuales 1:N/N:1, UI doble panel + export Excel + integración con vista de extracto. |
| 7–8 | ⏳ Pendientes | Ver "Plan de implementación por fases" más arriba. |

Decisiones operativas vigentes:

- **Deploy a Vercel pausado.** Iteramos solo local; los pasos de cierre de fase son tests + lint + typecheck + build local.
- **Una fase por vez** con commit atómico al cierre. No mezclamos fases.
- **Idioma del código y UI**: español (excepto convenciones de framework).
- **Documentación viva** en `docs/` se mantiene al día junto con el código.
