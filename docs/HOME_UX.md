# Home — comportamiento detallado

> Estado: Fase 3. Documenta el flujo y las decisiones de UX de la pantalla
> de inicio (`/`). El layout visual completo está en
> `prompt-claude-code-extractos-bancarios-v4.md` §5.

## Concepto

La Home es el **punto de entrada para iniciar una nueva extracción**.
Tiene dos vías paralelas, no excluyentes:

1. **Camino feliz** — Dropzone rápido con auto-detección de perfil.
2. **Camino explícito** — Tabs de categoría + grid de cards de entidades +
   slide-over con perfiles concretos.

La Home **no es el workspace**. La vista de detalle del extracto vive en
`/extracciones/[id]`. En Fase 4 el workspace agrega un layout con
pestañas tipo navegador que reusa esa vista de detalle.

## Las tres capas de tabs

Concepto crítico — no mezclarlas:

| Capa | Dónde vive | Función |
|---|---|---|
| 1 — Categoría de entidad | Home (`TabsCategoriaEntidad`) | Filtra el grid: Bancos / Billeteras / Tarjetas / Favoritos |
| 2 — Producto/perfil | Slide-over (`PanelProducto`) | Cada sub-tab es un perfil de extracción de esa entidad |
| 3 — Pestaña del workspace | `/workspace` (Fase 4) | Cada pestaña es un extracto abierto |

## Tabs de categoría (capa 1)

| Tab | Filtro |
|---|---|
| 🏦 Bancos | `entidad.categoria === "banco"` |
| 📱 Billeteras | `entidad.categoria === "billetera"` |
| 💳 Tarjetas | Entidades con al menos un perfil cuyo `tipoDocumento ∈ {tarjeta_credito, tarjeta_debito}` |
| ⭐ Favoritos | Entidades marcadas en `usuarios.preferencias.bancosFavoritos` |

El tab Tarjetas es un filtro derivado, no un valor de `categoria`. En
Fase 2 las seeds traen solo perfiles `extracto_bancario`, así que ese
tab arranca vacío hasta que un admin cree perfiles de tarjeta (via
`POST /api/perfiles`).

Dentro del slide-over, el tab Tarjetas también filtra los perfiles
visibles a solo los de tipo tarjeta (`perfilesVisibles` en
`app/lib/home-tipos.ts`).

## Cards de entidad

Cada card muestra:

- Avatar con iniciales coloreadas (determinístico por slug —
  `paletaDeEntidad`). En Fase 3 no usamos logos reales; pueden
  cargarse después en `entidad.iconoUrl`.
- Nombre de la entidad y cantidad de perfiles asociados.
- Contador de extracciones del usuario para esa entidad
  (`extraccionesDelUsuario`). Es un proxy de "aprendizaje": funciona
  como señal hasta que llegue Fase 5 con `formatosAprendidos`.
- Estrella ⭐ para marcar/desmarcar favorito. La acción es optimista
  (UI cambia antes de la confirmación del servidor; revierte si falla).

Click en la card abre el **Panel de Producto** (slide-over).

## Panel de Producto (slide-over)

Componente: `app/components/home/PanelProducto.tsx`.

Render:

- Header con avatar, nombre, categoría y cantidad de perfiles.
- Tabs internas — una por perfil de la entidad.
- Para el perfil activo: nombre, tipo, moneda, slug, y un dropzone
  específico que envía `perfilId` fijado al backend.
- Botón al pie para marcar/desmarcar favorito.

Cerrar el panel:
- Click en X.
- Click fuera (backdrop).
- Tecla Escape.

Cuando se sube un archivo desde acá, el backend **no corre el detector**
(porque `perfilId` ya viene fijado). El POST 202 devuelve `deteccion: null`
y el cliente redirige directo a `/extracciones/[id]`.

## DropzoneRapido y auto-detección

Componente: `app/components/home/DropzoneRapido.tsx`.

Flujo:

1. El usuario arrastra o elige un PDF.
2. UI hace `POST /api/extracciones` (multipart) sin `perfilId` ni `banco`.
3. Backend:
   - Extrae texto del PDF.
   - Llama al detector con el texto completo (truncado a 8000 chars).
   - Si `score >= 0.85`: asigna `perfilId` y `banco` desde el perfil mejor
     puntuado antes de crear la extracción.
4. Backend responde 202 con `deteccion: { mejor, candidatos, umbral, auto }`.
5. UI decide:
   - `deteccion.auto === true` → toast con la entidad detectada y `router.push("/extracciones/<id>")`.
   - `deteccion.candidatos.length > 0` (score insuficiente) → abre
     `ModalDeteccionDudosa` con los candidatos.
   - Sin detector (perfil ya estaba fijado o falló) → redirect directo.

El umbral `0.85` está harcodeado en `app/api/extracciones/route.ts`
(`UMBRAL_AUTO_DETECCION`). Está alineado con la spec §5.3.

## Modal de detección dudosa

Componente: `app/components/home/ModalDeteccionDudosa.tsx`.

Muestra los top-N candidatos (por defecto 3) con score, razones y un
botón "elegir" por cada uno. También un botón "Saltar y revisar después".

- **Elegir un candidato**: `PATCH /api/extracciones/<id>` con `perfilId`
  → el backend actualiza el doc y devuelve el nombre de la entidad como
  `banco`. La UI redirige a `/extracciones/<id>`.
- **Saltar / cerrar**: redirige a `/extracciones/<id>` sin tocar el doc.
  El usuario puede asignar el perfil manualmente más adelante.

Nota: el modal aparece **después** de que la extracción ya empezó a
correr en background. El `perfilId` es metadata; cambiarlo no
re-ejecuta la extracción. En Fase 5 se vinculará al aprendizaje de
formato y ahí sí tendrá efecto sobre la lógica de extracción.

## Carrusel de últimos extractos

Componente: `app/components/home/CarruselUltimosExtractos.tsx`.

Muestra hasta `HOME_MOSTRAR_ULTIMOS_N` (default 8) extracciones del
usuario, ordenadas por `createdAt` descendente. Cada tarjeta linkea a
`/extracciones/<id>`. Estados visibles: `pendiente`, `procesando…`,
`✓ listo`, `⚠ parcial`, `✗ error`.

Se oculta cuando el usuario no tiene extracciones todavía
(estado vacío explícito en la primera visita).

## Endpoints

| Método | Ruta | Notas |
|---|---|---|
| `GET` | `/api/home/resumen` | Devuelve bancos (agrupados por entidad), destacados, favoritos, últimos N. |
| `POST` | `/api/usuarios/favoritos` `{entidadSlug}` | `$addToSet` en `usuarios.preferencias.bancosFavoritos`. Valida que `entidadSlug` exista en al menos un perfil activo. |
| `DELETE` | `/api/usuarios/favoritos?entidadSlug=…` | `$pull` del mismo array. |
| `POST` | `/api/extracciones` | Acepta opcionalmente `perfilId` (skip detector). Si no viene, corre detector y, si `score ≥ 0.85`, fija `perfilId`. Devuelve `deteccion` en el 202. |
| `PATCH` | `/api/extracciones/[id]` `{perfilId}` | Asocia perfil después del hecho. Usado por el modal de detección dudosa. |

## Reglas operativas

- **Favoritos**: el item del array `bancosFavoritos` es el `entidad.slug`,
  no el `perfilId`. Una entidad favorita destaca todas sus tarjetas/extractos.
- **Optimismo en favoritos**: el toggle aplica el cambio en UI antes
  de la respuesta del servidor y revierte si falla. Esto evita lags
  visibles en clicks repetidos.
- **Estado del catálogo**: la Home consume `/api/home/resumen`. Si un
  admin agrega un perfil nuevo, la próxima carga de la Home lo refleja
  automáticamente (no hay cache en cliente).
- **Cantidad de perfiles**: el number en la card es la cantidad **dentro
  del filtro de la tab activa**, no el total absoluto. Esto evita
  inconsistencias visuales cuando se filtra por Tarjetas.
