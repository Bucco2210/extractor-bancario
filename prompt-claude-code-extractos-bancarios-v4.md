# PROMPT MAESTRO PARA CLAUDE CODE (v4 — Vercel + MongoDB + Workspace + Home con tabs de bancos)
## Sistema de Importación, Extracción y Conciliación de Extractos Bancarios con IA

> Esta v4 mantiene todo lo definido en v3 y **agrega la especificación detallada de la pantalla de inicio (Home)** con sus dos vías de entrada: drag & drop rápido y selección explícita por banco/billetera mediante tabs/cards. Conviene leerla completa porque también clarifica las **tres capas de navegación tipo "tabs"** del sistema.

---

## 1. Contexto y rol

Sos un ingeniero de software senior especializado en aplicaciones full-stack desplegadas en Vercel. Vas a construir desde cero un sistema completo de importación, extracción inteligente, conciliación y exportación de extractos bancarios y de billeteras virtuales (Mercado Pago, Ualá, Naranja X, Cuenta DNI, Personal Pay, etc.) para ETHOS GESTIÓN CONTABLE.

Frontend y backend en el mismo proyecto Next.js (App Router).

---

## 2. Las tres capas de navegación ⭐ (clarificación importante)

El sistema tiene **tres conceptos de "tabs/pestañas"** que cumplen funciones distintas y no deben mezclarse:

### Capa 1 — Tabs de categoría de entidad (en la Home)
Tabs horizontales arriba del catálogo de bancos: `🏦 Bancos | 📱 Billeteras | 💳 Tarjetas | ⭐ Favoritos`. Filtran el grid de cards visibles.

### Capa 2 — Sub-tabs por tipo de producto (al elegir un banco)
Cuando el usuario hace click en una card de banco, se abre un panel con tabs internos: `Caja Ahorro ARS | Cuenta Corriente ARS | Caja Ahorro USD | Tarjeta`. Cada tab es un **perfil de extracción** distinto.

### Capa 3 — Pestañas del workspace (extractos abiertos)
Una vez subido un archivo, se abre como pestaña tipo navegador en `/workspace`. Cada pestaña = un extracto en proceso o ya extraído.

---

## 3. Stack tecnológico

(Idéntico a v3 — lo resumo)

- **Next.js 15+ App Router + TypeScript estricto**
- **React 19 + TailwindCSS + shadcn/ui + lucide-react**
- **Zustand** con persist para estado del workspace
- **MongoDB Atlas + mongoose**, conexión cacheada para serverless
- **Vercel Blob** para archivos originales
- **OpenAI SDK** (`gpt-4o-mini` default, `gpt-4o` fallback)
- **`pdfjs-dist` legacy + `pdf-lib`**, OCR vía OpenAI vision
- **`exceljs`** para exportación
- **Auth.js v5** con adapter Mongo, roles admin/operador
- **Inngest** para jobs largos
- **`zod`, `pino`, `fast-levenshtein`**

---

## 4. Variables de entorno

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

Validar todas con zod en `app/lib/env.ts`.

---

## 5. Pantalla de Inicio (Home) ⭐ **DETALLE COMPLETO**

### 5.1 Ruta y comportamiento

- Ruta: `/` (después de login redirige acá).
- Si el usuario ya tiene pestañas abiertas en el workspace, mostrar arriba un banner: *"Tenés 3 extractos abiertos en el workspace [→ ir]"*.
- La Home **no reemplaza** al workspace: es el punto de entrada para **iniciar una nueva importación**. El workspace vive en `/workspace`.

### 5.2 Layout visual

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

### 5.3 Sección 1 — Dropzone rápido (camino feliz)

- Componente `DropzoneRapido` que ocupa la franja superior.
- Drop o click → upload directo → pipeline de auto-detección de perfil (ver v3 §6.3).
- Durante la subida, muestra spinner y progreso.
- Apenas detecta el perfil, abre la pestaña en el workspace y **redirige a `/workspace`**.
- Si la confianza de detección < 0.85 → no redirige, muestra modal: *"No pude identificar el banco con seguridad. Elegí manualmente:"* con el grid de cards filtrado.

### 5.4 Sección 2 — Selección explícita por banco/billetera

Tabs de categoría arriba del grid:

- `🏦 Bancos` (default activa)
- `📱 Billeteras` (Mercado Pago, Ualá, Naranja X, Cuenta DNI, Personal Pay)
- `💳 Tarjetas` (Visa, Mastercard, Amex resúmenes)
- `⭐ Favoritos` (los más usados por el usuario, según `usuarios.preferencias.bancosFavoritos`)

Cada **card de banco** muestra:

```
┌─────────────────┐
│   🏦 [logo]     │
│                 │
│   Banco Galicia │
│   3 productos   │  ← cantidad de perfiles asociados
│   ✓ aprendido   │  ← si ya hay formatos aprendidos
└─────────────────┘
```

Estados visuales de la card:
- **Normal**: borde gris.
- **Hover**: borde azul.
- **Con formato aprendido**: ícono ✓ verde y leyenda *"extracción instantánea"*.
- **Sin formato aprendido**: ícono 🧪 amarillo y leyenda *"requiere primera extracción con IA"*.
- **Favorito**: estrella ⭐ en esquina superior derecha.

Click en card → abre **Panel de Producto** (sección 5.5).

### 5.5 Panel de Producto (al hacer click en un banco)

Se despliega como **slide-over panel** desde la derecha (no modal centrado) para no romper el contexto de la Home.

```
┌──────────────────────────────────────────────────────┐
│  🏦 Banco Galicia                          [× cerrar]│
│  ──────────────────────────────────────────────────  │
│                                                      │
│  ┌─[Caja Ahorro ARS]─[Cta Cte ARS]─[CA USD]─[Tarj]─┐│
│  │                                                  ││
│  │  Caja de Ahorro en Pesos                         ││
│  │  Perfil: galicia_caja_ahorro_ars                 ││
│  │                                                  ││
│  │  📊 Estado de aprendizaje                        ││
│  │  ✓ Formato aprendido (4 extracciones exitosas)   ││
│  │  ⚡ Extracción esperada: < 2 segundos            ││
│  │                                                  ││
│  │  ┌────────────────────────────────────────────┐  ││
│  │  │  📄 Arrastrá el extracto acá               │  ││
│  │  │      o hacé click para elegir              │  ││
│  │  └────────────────────────────────────────────┘  ││
│  │                                                  ││
│  │  ⚙ Opciones avanzadas                            ││
│  │  □ Forzar re-extracción con IA (ignorar reglas)  ││
│  │  □ Período personalizado: [desde] [hasta]        ││
│  │                                                  ││
│  │  💡 Tip: si subís un extracto de Cuenta         ││
│  │  Corriente acá, va a fallar la validación.      ││
│  │  Cambiá al tab correspondiente.                  ││
│  │                                                  ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  [Marcar Galicia como favorito ⭐]                   │
└──────────────────────────────────────────────────────┘
```

Cada **sub-tab** corresponde a un perfil de extracción asociado a esa entidad. Al subir el archivo desde acá, el `perfilId` queda fijado por el usuario (`perfilOrigen: 'usuario_eligio'`) y el sistema **no intenta auto-detectar otro perfil**, solo valida que las `validacionesEspeciales` del perfil se cumplan. Si no se cumplen, alerta al usuario y le ofrece cambiar de perfil o forzar.

### 5.6 Sección 3 — Últimos extractos procesados

Carrusel horizontal con las últimas `HOME_MOSTRAR_ULTIMOS_N` extracciones del usuario (default 8). Cada tarjeta muestra entidad, producto, período y estado. Click → abre el extracto como pestaña en el workspace.

### 5.7 Estado vacío

Primera vez que el usuario entra (sin extractos previos):

- Dropzone rápido visible.
- Mensaje encima del grid: *"Estos son los bancos más usados en Argentina. Tu primer extracto va a tardar un poco más porque el sistema está aprendiendo el formato. Los siguientes son instantáneos."*
- Sección de "últimos extractos" oculta.

---

## 6. Modelos de MongoDB

(Mismos que v3, con dos agregados puntuales)

### `usuarios` — campo agregado
```typescript
preferencias: {
  perfilFavorito?: ObjectId,
  bancosFavoritos?: [ObjectId],       // ⭐ NUEVO - para tab "⭐ Favoritos" en Home
  pestañasAbiertas?: [...]
}
```

### `perfilesExtraccion`, `extracciones`, `formatosAprendidos`, `conciliaciones`, `auditoria`
Iguales a v3.

---

## 7. Estructura de archivos (delta respecto a v3)

```
app/
├── (ui)/
│   ├── page.tsx                            ⭐ NUEVO - Home (reemplaza redirect)
│   ├── workspace/...
│   └── ...
├── components/
│   ├── home/                               ⭐ NUEVO
│   │   ├── DropzoneRapido.tsx
│   │   ├── TabsCategoriaEntidad.tsx
│   │   ├── GridBancos.tsx
│   │   ├── CardBanco.tsx
│   │   ├── PanelProducto.tsx               (slide-over con sub-tabs de productos)
│   │   ├── SubTabsProducto.tsx
│   │   └── CarruselUltimosExtractos.tsx
│   ├── workspace/...
│   └── ...
└── api/
    ├── home/
    │   └── resumen/route.ts                 ⭐ NUEVO - devuelve bancos destacados,
    │                                        favoritos del usuario, últimos extractos
    └── usuarios/
        └── favoritos/route.ts               ⭐ NUEVO - POST/DELETE para marcar bancos
```

---

## 8. Plan de implementación por fases (actualizado)

**Fase 1 — Setup y MVP**
- `create-next-app` + Tailwind + shadcn.
- `.env.example` con validación zod.
- Conexión MongoDB cacheada.
- Auth.js v5 con login básico.
- Endpoint upload a Vercel Blob + extracción OpenAI básica.
- Export Excel mínimo.
- Deploy a Vercel funcionando.

**Fase 2 — Perfiles de extracción**
- Modelo `PerfilExtraccion`.
- 17 perfiles seed iniciales.
- Endpoints `/api/perfiles/*`.
- Detector de perfil con OpenAI.

**Fase 3 — Home con tabs de bancos** ⭐ **NUEVA POSICIÓN**
- Ruta `/` con layout completo.
- `DropzoneRapido` con auto-detección.
- Tabs de categoría + grid de cards de bancos.
- Panel de producto con sub-tabs.
- Favoritos del usuario.
- Carrusel de últimos extractos.
- Endpoint `/api/home/resumen`.

**Fase 4 — Workspace con pestañas**
- Zustand store del workspace + persist.
- Layout `/workspace` con barra de pestañas.
- Componentes de pestañas, selector de perfil, split view.
- Sincronización a MongoDB.
- Atajos de teclado.

**Fase 5 — Aprendizaje**
- Detector de formato por huella.
- Generación de reglas determinísticas.
- Asociación a perfiles.
- UI `/formatos`.

**Fase 6 — Conciliación**
- Carga de segunda fuente.
- Matcheo con tolerancias.
- UI doble panel + export.

**Fase 7 — Robustez**
- OCR vía OpenAI vision.
- Inngest para jobs largos.
- Encriptación de campos sensibles.
- Tests ≥ 70%.

**Fase 8 — Pulido**
- Dashboard con KPIs.
- Modo oscuro.
- Documentación final.

---

## 9. Criterios de aceptación (delta respecto a v3)

- [ ] Al entrar a `/` después de login, se ve la Home con dropzone + tabs de categoría + grid de bancos + últimos extractos.
- [ ] Arrastrar archivo al dropzone rápido lanza auto-detección y, si confianza ≥ 0.85, abre la pestaña directamente en `/workspace`.
- [ ] Si confianza < 0.85, abre modal pidiendo elegir banco manualmente.
- [ ] Tabs de categoría (`Bancos / Billeteras / Tarjetas / Favoritos`) filtran el grid correctamente.
- [ ] Click en card de banco abre slide-over con sub-tabs de productos.
- [ ] Sub-tabs corresponden 1 a 1 con perfiles de extracción asociados al banco.
- [ ] Marcar/desmarcar banco como favorito persiste en MongoDB.
- [ ] Cards muestran estado de aprendizaje (con o sin formato aprendido).
- [ ] El carrusel de últimos extractos abre cada uno en el workspace.

---

## 10. Instrucciones operativas para Claude Code

1. Creá el README con el plan de fases, lista de variables de entorno, descripción de las tres capas de tabs y bocetos ASCII de la Home; pedime confirmación.
2. Trabajá **una fase por vez**. Tests al cierre y resumen.
3. Antes de instalar dependencias, justificá.
4. Comentarios y variables en español, salvo convenciones de framework.
5. Si encontrás ambigüedad, preguntá antes de asumir.
6. Commits atómicos en español.
7. Documentación viva: `docs/ARQUITECTURA.md`, `docs/DEPLOY_VERCEL.md`, `docs/PERFILES_EXTRACCION.md`, `docs/HOME_UX.md`.
8. Verificá deploy a Vercel al finalizar cada fase.

Arrancá ahora con la Fase 1.
