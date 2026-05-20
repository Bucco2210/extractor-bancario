# CLAUDE.md — B&B Tech (extractor bancario)

> Instrucciones operativas para Claude Code en este repositorio. La especificación funcional completa vive en `prompt-claude-code-extractos-bancarios-v4.md` y el plan resumido en `README.md`.

## Descripción del proyecto

**B&B Tech** es un sistema multiusuario para ETHOS Gestión Contable que **importa, extrae con IA, concilia y exporta** extractos bancarios y de billeteras virtuales (Mercado Pago, Ualá, Naranja X, Cuenta DNI, Personal Pay, etc.). Aplicación full-stack Next.js.

## Stack tecnológico

- **Next.js 15+ App Router + TypeScript estricto**
- **React 19 + TailwindCSS + shadcn/ui + lucide-react**
- **Zustand** con `persist` para estado del workspace
- **MongoDB Atlas + Mongoose** (conexión cacheada para serverless)
- **Vercel Blob** para archivos originales
- **OpenAI SDK** (`gpt-4o-mini` default, `gpt-4o` fallback) — **no usamos Anthropic en este proyecto**
- **`pdfjs-dist` legacy + `pdf-lib`**, OCR vía OpenAI vision
- **`exceljs`** para exportación
- **Auth.js v5** con adapter Mongo, roles `admin` / `operador`
- **Inngest** para jobs largos
- **`zod`, `pino`, `fast-levenshtein`**

## Las tres capas de navegación

No confundirlas — son tres conceptos distintos:

1. **Tabs de categoría de entidad (Home)** — `🏦 Bancos | 📱 Billeteras | 💳 Tarjetas | ⭐ Favoritos`. Filtran el grid de cards.
2. **Sub-tabs por producto (Panel de Producto)** — al hacer click en una card de banco, se abre slide-over con `Caja Ahorro ARS | Cta Cte ARS | CA USD | Tarjeta`. **Cada sub-tab es un perfil de extracción.**
3. **Pestañas del workspace** — `/workspace` con pestañas tipo navegador, cada una es un extracto en proceso o ya extraído.

## Estructura objetivo del proyecto

```
app/
├── (ui)/
│   ├── page.tsx                     # Home
│   ├── workspace/...
│   ├── conciliacion/...
│   ├── perfiles/...
│   ├── formatos/...
│   ├── extracciones/...
│   └── configuracion/...
├── api/
│   ├── home/resumen/route.ts
│   ├── usuarios/favoritos/route.ts
│   ├── perfiles/...
│   ├── extracciones/...
│   ├── conciliaciones/...
│   └── auth/[...nextauth]/route.ts
├── components/
│   ├── home/
│   │   ├── DropzoneRapido.tsx
│   │   ├── TabsCategoriaEntidad.tsx
│   │   ├── GridBancos.tsx
│   │   ├── CardBanco.tsx
│   │   ├── PanelProducto.tsx
│   │   ├── SubTabsProducto.tsx
│   │   └── CarruselUltimosExtractos.tsx
│   ├── workspace/...
│   └── ui/...                       # shadcn
├── lib/
│   ├── env.ts                       # validación zod de env vars
│   ├── mongo.ts                     # conexión cacheada
│   ├── openai.ts
│   ├── auth.ts
│   ├── blob.ts
│   ├── pdf.ts
│   └── ...
├── models/                          # Mongoose schemas
│   ├── Usuario.ts
│   ├── PerfilExtraccion.ts
│   ├── Extraccion.ts
│   ├── FormatoAprendido.ts
│   ├── Conciliacion.ts
│   └── Auditoria.ts
└── stores/
    └── workspace.ts                 # Zustand
```

(La estructura se va creando incrementalmente fase a fase, no toda de una.)

## Modelos de MongoDB (resumen)

- `usuarios` — incluye `preferencias.perfilFavorito`, `preferencias.bancosFavoritos`, `preferencias.pestañasAbiertas`.
- `perfilesExtraccion` — prompts y validaciones por banco/producto.
- `extracciones` — resultado de cada extracción, con `_meta` (modelo usado, tokens, tiempo).
- `formatosAprendidos` — reglas determinísticas asociadas a un perfil.
- `conciliaciones` — matches entre extractos y segunda fuente.
- `auditoria` — log de acciones sensibles.

## Plan de fases

Trabajamos **una fase por vez**, con tests al cierre y verificación de deploy a Vercel.

1. **Setup y MVP** — Next.js + Tailwind + shadcn + Mongo + Auth.js + upload Blob + extracción OpenAI mínima + export Excel + deploy.
2. **Perfiles de extracción** — modelo + 17 seeds + endpoints CRUD + detector con OpenAI.
3. **Home con tabs de bancos** — `/`, dropzone, tabs categoría, grid, panel producto, favoritos, carrusel últimos.
4. **Workspace con pestañas** — `/workspace`, Zustand persist, sincronización a Mongo, atajos.
5. **Aprendizaje** — huella, reglas determinísticas, UI `/formatos`.
6. **Conciliación** — segunda fuente, matcheo con tolerancias, doble panel.
7. **Robustez** — OCR vision, Inngest, encriptación, tests ≥ 70%.
8. **Pulido** — dashboard KPIs, modo oscuro, docs finales.

## Reglas operativas

1. **Una fase por vez.** Tests al cierre + commit atómico + verificar deploy a Vercel.
2. **Antes de instalar dependencias, justificar** qué problema resuelve y por qué no se puede sin ella.
3. **Antes de asumir, preguntar.** Si hay ambigüedad funcional o de UX, frenar y consultar.
4. **Commits atómicos en español.**
5. **Documentación viva**: mantener al día `docs/ARQUITECTURA.md`, `docs/DEPLOY_VERCEL.md`, `docs/PERFILES_EXTRACCION.md`, `docs/HOME_UX.md`.
6. **Deploy a Vercel verificado al cierre de cada fase**, no solo `npm run build` local.
7. **No mezclar las tres capas de tabs** ni renombrarlas — son conceptos distintos.

## Convenciones de código

- **Idioma**: variables, comentarios y mensajes de UI en **español**. Excepciones: convenciones de framework (`page.tsx`, `route.ts`, `useState`, etc.) y nombres de paquetes npm.
- **TypeScript estricto.** Nada de `any` salvo justificación. `unknown` + narrowing cuando haga falta.
- **Validación de límites del sistema con zod**: env vars, payloads de API, datos que llegan de OpenAI.
- **Locale `es-AR`** para formateo de números y fechas en UI.
- **Mongoose**: schemas tipados, conexión cacheada en `app/lib/mongo.ts`.
- **No persistir archivos PDF en disco del server** — todo a Vercel Blob.
- **Encriptación** con `APP_ENCRYPTION_KEY` para campos sensibles definidos en los modelos.
- **Logs estructurados con `pino`** (no `console.log` en producción).
- **Errores HTTP** consistentes: 400 input inválido, 401 sin auth, 403 sin permiso, 404 no encontrado, 422 archivo no procesable, 429 límite excedido, 5xx interno.

## Lo que no se hace

- No usar Anthropic SDK — el motor es OpenAI.
- No introducir framework de UI alternativo (Mantine, Chakra, Material UI). Solo Tailwind + shadcn.
- No persistir estado del workspace solo en localStorage cuando `PERSISTIR_PESTAÑAS_EN_MONGO=true`.
- No crear pantallas o endpoints fuera del scope de la fase en curso.
- No agregar tests de UI cuando se pueden cubrir las mismas garantías con tests de lógica/handlers.
- No commits que mezclen fases.

## Cómo arrancar una fase nueva

1. Releer la sección correspondiente del `prompt-claude-code-extractos-bancarios-v4.md` y del `README.md`.
2. Listar el alcance concreto y los criterios de aceptación.
3. Confirmar con el usuario antes de instalar dependencias o tomar decisiones de arquitectura no triviales.
4. Implementar.
5. Tests + lint + build local + deploy Vercel.
6. Actualizar la documentación viva relevante.
7. Commit atómico.

## Estado actual

**Fases 1, 2, 3, 4, 5 y 6 cerradas. Próxima: Fase 7 (OCR vision, Inngest, encriptación, cobertura ≥ 70%).**

- **Fase 1 — MVP local**: Next.js 16 + Mongo + Auth.js + OpenAI. Upload + extracción async con chunking server-side, persistencia incremental por chunk y reanudación. Endpoints: `POST /api/extracciones`, `GET /api/extracciones/:id`, `POST /api/extracciones/:id/reanudar`, `GET /api/extracciones/:id/excel`.
- **Fase 2 — Perfiles**: modelo `PerfilExtraccion` con entidad embebida + `tipoDocumento` (`extracto_bancario`/`tarjeta_credito`/`tarjeta_debito`). 17 entidades seed cargadas via `npm run seed:perfiles` (idempotente). CRUD `/api/perfiles/*` con admin gate. Detector con OpenAI en `POST /api/perfiles/detectar`.
- **Fase 3 — Home**: ruta `/` completa con DropzoneRapido + tabs (banco/billetera/tarjeta/favoritos) + grid de cards + slide-over PanelProducto + carrusel últimos. Detector cableado al `POST /api/extracciones` (umbral 0.85); cuando el score no alcanza se ofrece modal de confirmación manual. Favoritos en `usuarios.preferencias.bancosFavoritos` con endpoints `POST/DELETE /api/usuarios/favoritos`. `PATCH /api/extracciones/[id]` para asignar perfilId tras el hecho.
- **Fase 4 — Workspace**: ruta `/workspace` con pestañas tipo navegador, store Zustand con `persist` (localStorage) + sync a Mongo (debounced 500ms) via `useWorkspaceSync`. Endpoints `GET/PUT /api/usuarios/pestanas` (recorte server-side al `MAX_PESTANAS_ABIERTAS`). Atajos: `Cmd/Ctrl+W`, `Cmd/Ctrl+Shift+W`, `Cmd/Ctrl+1..9`. Dropzone/panel/carrusel/modal de la Home abren pestaña + redirigen a `/workspace`. La vista `/extracciones/[id]` standalone queda accesible para bookmarks.
- **Fase 5 — Aprendizaje**: modelo `FormatoAprendido` con huella SHA-256 + regla regex (grupos `fecha`, `descripcion`, `referencia`, `debito`, `credito`, `saldo`). Pipeline regla-primero: si hay regla activa para la huella y `matchRate >= APRENDIZAJE_UMBRAL_MATCH_RATE` (default 0.8), persiste `fuente="regla"` sin llamar a OpenAI. Si no, fallback IA y upsert del formato (stats.extraccionesIA++) al cerrar exitoso. Endpoints `/api/formatos/*` (lectura sesión, edición admin) + `POST /[id]/probar`. UI `/formatos` con editor y área de prueba (solo admin escribe). Vista de detalle muestra badge "Regla determinística" vs "Extracción por IA".
- **Fase 6 — Conciliación**: modelo `Conciliacion` con `segundaFuente` embebida (registros parseados + mapeo + headers crudos), `matches[]` 1:1 con `confirmadoManualmente`, `descartadosExtracto[]`, `gruposManuales[]` (sumatorias 1:N / N:1) y `estadisticas` recalculadas server-side. Parser CSV (sep auto, comillas, BOM) + XLSX con auto-mapeo de columnas por sinónimos; si falta columna requerida devuelve 422 + headers crudos para mini-mapeador del front. Matcheador determinístico (sin OpenAI) score = 0.4·fecha + 0.3·importe + 0.3·descripción (fast-levenshtein), tolerancias `(días, importe, fuzzy)` desde `.env`, comparación por valor absoluto, asignación 1:1 greedy. Endpoints `GET/POST /api/conciliaciones`, `GET/PATCH/DELETE /api/conciliaciones/[id]` y `GET /api/conciliaciones/[id]/excel`. PATCH soporta `forzarMatch`, `quitarMatch`, `descartarExtracto`, `crearGrupoManual`, `eliminarGrupoManual`, `reMatchear` (preserva manuales y grupos). UI `/conciliacion` (listado) y `/conciliacion/[id]` (doble panel + selección múltiple + barra contextual + tolerancias + grupos manuales). Integración en `/extracciones/[id]` y `/workspace` con panel "Conciliaciones" (historial + nuevo + mini-mapeador in-line).

**Decisión vigente**: deploy a Vercel pausado, todo local. Verificación de cierre de fase = tests + lint + typecheck + build local (sin `git push` ni Vercel).

La especificación completa vive en `prompt-claude-code-extractos-bancarios-v4.md` y el plan resumido en `README.md`.
