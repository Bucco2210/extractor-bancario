# ETHOS Extractor Bancario

Sistema multiusuario de **importación, extracción inteligente, conciliación y exportación** de extractos bancarios y de billeteras virtuales (Mercado Pago, Ualá, Naranja X, Cuenta DNI, Personal Pay, etc.) para ETHOS Gestión Contable.

Aplicación full-stack Next.js desplegada en Vercel, con MongoDB Atlas como base de datos y OpenAI como motor de extracción.

> Este repositorio está en **reescritura completa** desde una versión previa en Express + HTML vanilla. La especificación oficial es el documento `prompt-claude-code-extractos-bancarios-v4.md`. Este README refleja el plan acordado antes de iniciar la Fase 1.

---

## Stack tecnológico

- **Framework**: Next.js 15+ (App Router) + TypeScript estricto
- **UI**: React 19 + TailwindCSS + shadcn/ui + lucide-react
- **Estado cliente**: Zustand con `persist` para el workspace
- **Base de datos**: MongoDB Atlas + Mongoose (conexión cacheada para serverless)
- **Storage de archivos**: Vercel Blob
- **IA**: OpenAI SDK — `gpt-4o-mini` por defecto, `gpt-4o` como fallback
- **PDF**: `pdfjs-dist` legacy + `pdf-lib`; OCR vía OpenAI vision
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
│ ETHOS Extractor                          [👤 Seba] [⚙] [🌙] [👁‍🗨] │
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

### Fase 1 — Setup y MVP
- `create-next-app` + Tailwind + shadcn.
- `.env.example` con validación zod en `app/lib/env.ts`.
- Conexión MongoDB cacheada para serverless.
- Auth.js v5 con login básico (rol `admin` / `operador`).
- Endpoint upload a Vercel Blob + extracción OpenAI mínima.
- Export Excel mínimo con `exceljs`.
- Deploy a Vercel funcionando.

### Fase 2 — Perfiles de extracción
- Modelo `PerfilExtraccion` en Mongo.
- 17 perfiles seed iniciales (bancos argentinos + billeteras).
- Endpoints CRUD `/api/perfiles/*`.
- Detector de perfil con OpenAI (texto extraído → perfil con score de confianza).

### Fase 3 — Home con tabs de bancos
- Ruta `/` con layout completo.
- `DropzoneRapido` con auto-detección.
- Tabs de categoría + grid de cards de bancos.
- Panel de producto (slide-over) con sub-tabs por producto.
- Favoritos del usuario en `usuarios.preferencias.bancosFavoritos`.
- Carrusel de últimos extractos.
- Endpoint `/api/home/resumen` (bancos destacados + favoritos + últimos).

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

### Fase 6 — Conciliación
- Carga de segunda fuente (cobranzas internas, contabilidad).
- Matcheo con tolerancias (días, importe, fuzzy de descripción).
- UI doble panel + export.

### Fase 7 — Robustez
- OCR vía OpenAI vision para PDFs escaneados.
- Inngest para jobs largos.
- Encriptación de campos sensibles con `APP_ENCRYPTION_KEY`.
- Tests con cobertura ≥ 70%.

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
APP_NAME=ETHOS Extractor Bancario
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
| OpenAI API | Disponible | Usar la API key existente |
| MongoDB Atlas | Disponible | Confirmar cluster y connection string |
| Vercel | Pendiente | Crear cuenta y proyecto al iniciar Fase 1 |
| Vercel Blob | Pendiente | Generar token al crear el proyecto Vercel |
| Inngest | Diferido | Necesario recién en Fase 7 |

---

## Comandos (post Fase 1)

```bash
npm install
npm run dev        # next dev
npm run build      # next build
npm run start      # next start
npm run lint
npm run test
```

---

## Documentación viva

Se irá completando a lo largo de las fases:

- `docs/ARQUITECTURA.md` — modelos de datos, capas, flujo de extracción.
- `docs/DEPLOY_VERCEL.md` — pasos de deploy, variables, troubleshooting.
- `docs/PERFILES_EXTRACCION.md` — catálogo de perfiles seed y cómo agregar nuevos.
- `docs/HOME_UX.md` — comportamiento detallado de la Home y las tres capas de tabs.

---

## Estado actual

**Pendiente iniciar Fase 1.** El proyecto previo (Express + HTML vanilla + Anthropic) será eliminado al ejecutar `create-next-app`. La especificación completa vive en `prompt-claude-code-extractos-bancarios-v4.md`.
