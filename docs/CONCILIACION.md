# Conciliación con segunda fuente

> Estado: Fase 6. Modelo + parser CSV/XLSX + matcheador determinístico +
> UI doble panel + grupos manuales 1:N / N:1 + export Excel.

## Concepto

**Conciliar = cruzar los movimientos de un extracto ya extraído (fuente
A) contra una segunda fuente (CSV/XLSX de cobranzas internas,
contabilidad, etc.) y marcar qué cuadró, qué quedó huérfano de cada lado
y qué se ignora.** El matcheo es 100% determinístico (no se llama a
OpenAI) y se hace con tolerancias configurables.

No es re-extracción: la fuente A es una `Extraccion` ya cerrada en
Mongo. La segunda fuente se sube cada vez como archivo nuevo (CSV o
XLSX hasta 10 MB).

## Modelo `Conciliacion`

| Campo | Tipo | Notas |
|---|---|---|
| `usuarioId` | ObjectId | Dueño. Toda query filtra por acá. |
| `extraccionId` | ObjectId | Extracto contra el que se concilia. Indexado: el historial por extracto es gratis. |
| `nombre` | string | Etiqueta humana (editable). |
| `estado` | enum | `pendiente` / `completada`. |
| `segundaFuente.archivoNombre` | string | Nombre original del CSV/XLSX. |
| `segundaFuente.formato` | enum | `csv` / `xlsx`. |
| `segundaFuente.registros` | `[{ idx, fecha, descripcion, monto, referencia }]` | Filas ya parseadas. |
| `segundaFuente.mapeoColumnas` | `{ fecha, descripcion, monto, referencia }` | Headers reales que se usaron. |
| `segundaFuente.headersOriginales` | string[] | Headers crudos del archivo. |
| `tolerancias` | `{ dias, importe, fuzzyUmbral }` | Default desde `.env`. |
| `matches` | `[{ extractoIdx, registroIdx, score, criterios, confirmadoManualmente }]` | Pareos 1:1. |
| `descartadosExtracto` | number[] | Idxs del extracto marcados como "ignorar" (no cuentan como huérfanos). |
| `gruposManuales` | `[{ extractoIdxs, registroIdxs, nota, creadoEn }]` | Agrupaciones N:M para sumatorias. |
| `estadisticas` | objeto | Calculado server-side en cada cambio. |
| `notas` | string | Espacio libre. |

Índices: `usuarioId`, `extraccionId`, `(usuarioId, createdAt desc)`.

No hay índice único en `extraccionId` — el historial es N por extracto.

## Variables de entorno

```bash
CONCILIACION_TOLERANCIA_DIAS=2          # |fechaA - fechaB| ≤ X días
CONCILIACION_TOLERANCIA_IMPORTE_PESOS=1 # |montoA - montoB| ≤ $X (valor absoluto)
CONCILIACION_FUZZY_UMBRAL=0.85          # score combinado mínimo para hacer match
```

## Pipeline de matcheo (`app/lib/conciliacion-matcheo.ts`)

1. **Para cada par (movimiento, registro)** que pasa las tolerancias
   duras (diferencia de días ≤ tol, diferencia de importe absoluto
   ≤ tol):
   - `sFecha = 1 - dDias / tol.dias`
   - `sImporte = 1 - diffImporte / tol.importe`
   - `sDescripcion = 1 - levenshtein(a, b) / max(|a|, |b|)`
   - `score = 0.4·sFecha + 0.3·sImporte + 0.3·sDescripcion`
2. Filtra los pares con `score ≥ fuzzyUmbral`.
3. Ordena descendiente y asigna **1:1 greedy** (no reutiliza idxs).
4. Devuelve `matches` + `huerfanos` por lado.

El matcheador **compara importes por valor absoluto**, porque la
convención de signo difiere entre extracto bancario (débito/crédito) y
contabilidad (signo único). No re-matchea índices ya ocupados por
grupos manuales ni descartados.

## Parser CSV/XLSX (`app/lib/conciliacion-parser.ts`)

- **CSV**: separador auto-detectado (`,` o `;`), soporta comillas
  dobles y escape `""`, BOM al inicio.
- **XLSX**: lee la primera hoja con `exceljs`.
- **Auto-mapeo** de columnas por nombre normalizado con sinónimos
  (`fecha/date/fec`, `monto/importe/amount`, `descripcion/detalle/concepto`,
  `referencia/ref/comprobante`).
- Si falta alguna columna requerida (`fecha`, `descripcion`, `monto`),
  el POST devuelve **422** con los headers crudos + las filas sample
  para que el usuario mapee manualmente y reintente con
  `mapeoOverride`.
- **Importes**: detecta formato AR (`1.234,56`) vs US (`1,234.56`) por
  posición relativa de `.` y `,`.
- **Fechas**: normaliza a `DD/MM/YYYY` desde `DD/MM/YY[YY]`,
  `DD-MM-YY[YY]` o `YYYY-MM-DD`.

## Endpoints

| Verbo | Ruta | Acción |
|---|---|---|
| `GET` | `/api/conciliaciones?extraccionId=&limite=` | Lista del usuario, opcionalmente filtrada por extracto. |
| `POST` | `/api/conciliaciones` | Crea (multipart: `archivo`, `extraccionId`, `nombre`, opcional `mapeoOverride`). |
| `GET` | `/api/conciliaciones/[id]` | Detalle. |
| `PATCH` | `/api/conciliaciones/[id]` | Acciones (ver abajo). |
| `DELETE` | `/api/conciliaciones/[id]` | Borrado. |
| `GET` | `/api/conciliaciones/[id]/excel` | Export con hojas Resumen + Extracto + Segunda fuente + Grupos manuales. |

### Acciones del PATCH

Todas mutuamente combinables, devuelven el DTO recalculado.

| Campo body | Efecto |
|---|---|
| `nombre`, `notas`, `tolerancias` | Edición simple. |
| `forzarMatch: { extractoIdx, registroIdx }` | Crea match manual 1:1, libera idxs que estaban en otro match/grupo. |
| `quitarMatch: { extractoIdx }` | Saca el match de ese movimiento. |
| `descartarExtracto: { extractoIdx, descartar }` | Marca/desmarca como "ignorar"; el descartado no cuenta como huérfano. |
| `crearGrupoManual: { extractoIdxs, registroIdxs, nota? }` | Agrupa N movs + M registros (sumatoria). Saca los idxs de matches y descartados previos. |
| `eliminarGrupoManual: { indice }` | Borra el grupo. Los idxs liberados quedan huérfanos hasta que el usuario los re-matchee. |
| `reMatchear: true` | Vuelve a correr el matcheo automático **preservando** los confirmados manualmente y los grupos. |

## Grupos manuales (1:N / N:1)

El matcheador es estrictamente 1:1. Cuando en la realidad hay una
sumatoria (una transferencia bancaria que cubre 3 cobranzas, o varios
débitos del extracto que cuadran con un asiento contable agrupado), el
usuario los selecciona en la UI doble panel y crea un **grupo manual**.

- Los idxs del grupo se sacan del cómputo de huérfanos.
- Los idxs del grupo no se re-matchean cuando se corre "Re-matchear".
- Cada grupo lleva una nota libre.
- El export Excel incluye una hoja **"Grupos manuales"** con un detalle
  por grupo (cada fila lleva idx, lado, fecha, descripción, monto y la
  nota).

## UI

- **Listado**: `/conciliacion` — todas las conciliaciones del usuario.
  Links a `/conciliacion/[id]`.
- **Detalle**: `/conciliacion/[id]` — doble panel (extracto izquierda,
  segunda fuente derecha) con:
  - Checkboxes para selección múltiple a cada lado.
  - Barra contextual de acciones según la selección:
    - **1 + 1** → "Forzar match 1:1".
    - **N + M (con al menos 1 de cada lado)** → "Crear grupo manual"
      (con campo de nota opcional).
  - Acciones por fila: quitar match, descartar / recuperar.
  - Panel de tolerancias editable + botón "Re-matchear".
  - Lista de grupos manuales existentes con opción "Eliminar".
- **Integración**: la vista de cada extracto (`/extracciones/[id]` y
  pestañas del `/workspace`) muestra un panel **"Conciliaciones"** con:
  - Si no hay previas → botón primario **Conciliar**.
  - Si hay previas → lista compacta + botón **Nueva conciliación**.
  - Si el POST devuelve 422 (mapeo incompleto), aparece un mini
    selector con los headers crudos para que el usuario indique cuál es
    cuál y reintente.

## Decisiones explícitas

- **Sin aprendizaje cross-conciliación**: cada conciliación arranca de
  cero. No persistimos memoria de cómo el usuario resolvió ambigüedades
  pasadas (a diferencia de la fase 5, que sí aprende reglas regex de
  formato).
- **Sin OpenAI**: el matcheo es 100% determinístico para que sea
  auditable, rápido y barato.
- **1:N / N:1 solo manual**: el matcheador automático nunca propone
  grupos. La intención es evitar falsos positivos que sería caros de
  rastrear y deshacer.
