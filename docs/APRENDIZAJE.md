# Aprendizaje de formato

> Estado: Fase 5. Detector de formato por huella + reglas determinísticas
> + UI `/formatos` para revisar/editar.

## Concepto

Cuando ya extrajimos un puñado de extractos del mismo banco/producto,
no tiene sentido seguir pagándole a OpenAI por cada uno: el formato
del PDF es estable mes a mes. La fase 5 incorpora un **detector de
formato** (huella SHA-256 del PDF) y un sistema de **reglas
determinísticas** (regex) que reemplazan al modelo cuando el formato
ya fue aprendido.

## Modelo `FormatoAprendido`

| Campo | Tipo | Notas |
|---|---|---|
| `perfilId` | ObjectId | A qué perfil pertenece (Galicia CA ARS, etc). |
| `huella` | string (SHA-256 hex) | Identifica la familia de documentos. Único por colección. |
| `resumenHuella` | string | Primeras N líneas normalizadas, guardadas para debug. |
| `reglaRegex` | string \| null | Regex con grupos nombrados: `fecha`, `descripcion`, `referencia`, `debito`, `credito`, `saldo`. |
| `reglaActiva` | boolean | Si está activa, el pipeline la intenta antes de OpenAI. |
| `stats.extraccionesOk` | number | Veces que la regla cerró completa una extracción. |
| `stats.extraccionesIA` | number | Veces que la huella se vio pero la extracción cayó en OpenAI (no había regla, o falló). |
| `stats.extraccionesFallidas` | number | Veces que la regla intentó pero el `matchRate` no alcanzó el umbral. |
| `stats.primerUso` / `stats.ultimoUso` | Date | Para audit de descubrimiento y reactividad. |
| `notas` | string | Contexto que el admin quiera dejar. |
| `activo` | boolean | Soft delete. |

Índices: `huella` (único), `(perfilId, reglaActiva)`.

## Cálculo de la huella

`app/lib/huella.ts::calcularHuella`:

1. Toma las primeras **`APRENDIZAJE_HUELLA_LINEAS`** líneas (default 30, env).
2. Normaliza cada línea:
   - Lowercase.
   - Quita fechas `dd/mm/yyyy` / `dd-mm-yy`.
   - Quita montos con separadores decimales y de miles (`1.234.567,89`, `-250.00`).
   - Quita dígitos sueltos.
   - Comprime whitespace.
3. SHA-256 hex del resultado.

Garantía clave: **misma huella para dos extractos del mismo banco con datos
distintos**, **huella diferente entre bancos**. Cubierto por
`tests/huella.test.ts`.

## Pipeline al subir un PDF

```
POST /api/extracciones
  │
  ├─ extraer texto + chunks
  ├─ calcular huella
  │
  ├─ ¿perfilId asignado y FormatoAprendido con regla activa para esta huella?
  │    │
  │    ├─ Sí → aplicarRegla(texto, reglaRegex)
  │    │       │
  │    │       ├─ matchRate >= APRENDIZAJE_UMBRAL_MATCH_RATE (default 0.8)
  │    │       │   y errorCompilacion == null
  │    │       │   y movimientos > 0
  │    │       │   → persistir Extraccion con fuente="regla", estado="extraido"
  │    │       │     stats.extraccionesOk++ del formato
  │    │       │     responder 201 inmediatamente (sin runner OpenAI)
  │    │       │
  │    │       └─ falla → stats.extraccionesFallidas++ + caer al pipeline IA
  │    │
  │    └─ No → pipeline OpenAI normal
  │
  └─ runner OpenAI termina extracción
       Al finalizar OK con todos los chunks + tenemos perfilId + huella:
         FormatoAprendido.findOneAndUpdate({huella}, $setOnInsert + $inc IA, upsert:true)
         Extraccion.formatoAprendidoId = formato._id
```

## Regla regex

Una regla es **un regex con grupos nombrados** que matchea una línea
del PDF = un movimiento. Grupos:

- **Obligatorios**: `fecha`, `descripcion`.
- **Opcionales**: `referencia`, `debito`, `credito`, `saldo`.

`aplicarRegla(texto, regla)` itera línea por línea:

- Cada match es un movimiento. La fecha se normaliza a `DD/MM/YYYY`,
  los montos a `number` (parsea AR `1.234,56` y US `1,234.56`).
- Las líneas que **no matchean** se ignoran. Eso permite que el regex
  no se preocupe por encabezados/leyendas/footers.
- Para calcular el `matchRate` se cuenta cuántas líneas "parecen
  movimientos" (heurística `pareceMovimiento`: tienen fecha + monto) y
  cuántas de esas matchearon. Si la regla matchea ≥ 80% (configurable
  con `APRENDIZAJE_UMBRAL_MATCH_RATE`), se acepta el resultado.

### Ejemplo

```regex
^(?<fecha>\d{2}/\d{2}/\d{2,4})\s+(?<descripcion>.+?)\s+(?<debito>-?\d[\d.,]*)\s+(?<credito>-?\d[\d.,]*)\s+(?<saldo>-?\d[\d.,]*)$
```

Matchea líneas como:

```
03/10/2025 Sueldo enero              0,00       100.000,00   100.000,00
```

## Endpoints

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| `GET` | `/api/formatos` | Sesión | Filtros: `perfilId`, `entidad` (slug), `reglaActiva`, `activo`, `q`, `limite`. |
| `GET` | `/api/formatos/[id]` | Sesión | |
| `PATCH` | `/api/formatos/[id]` | Admin | Editar `reglaRegex`, `reglaActiva`, `notas`. Valida que el regex compile. No deja activar regla sin texto. |
| `DELETE` | `/api/formatos/[id]` | Admin | Soft delete: `activo=false`, `reglaActiva=false`. |
| `POST` | `/api/formatos/[id]/probar` | Sesión | Body `{texto, reglaRegex?}`. Devuelve `lineasMatcheadas`, `matchRate`, primeros movimientos. Permite probar antes de activar. |

## UI `/formatos`

- **Acceso**: cualquier sesión puede ver; **solo `admin` edita**.
- Layout dos columnas: lista de formatos (con filtro por entidad slug)
  y editor del seleccionado.
- Editor: textarea para el regex, toggle `reglaActiva`, notas, stats,
  resumen normalizado de la huella (collapsable), área para probar el
  regex contra un texto pegado.
- Borrar es soft delete.

## Vista de detalle de extracción

`/extracciones/[id]` y la pestaña del workspace muestran un badge:

- 🟢 **Regla determinística** si `fuente === "regla"`.
- 🔵 **Extracción por IA** si `fuente === "openai"`.

Cuando es por regla, no se muestran tokens/chunks (no se llamó a OpenAI).

## Reglas operativas

- **Crear formato manual**: no — un formato solo aparece tras una
  extracción exitosa (IA o regla). Si nunca se vio el documento, no
  hay formato.
- **Promoción a regla activa**: el admin entra a `/formatos`, escribe
  el regex, lo prueba con el textarea + botón "probar", y cuando el
  match-rate es alto activa la regla. La próxima extracción de la
  misma huella va por la regla.
- **Fallo de la regla en producción**: si la regla intenta pero el
  `matchRate` no alcanza el umbral, **fallback a OpenAI** y se
  incrementa `stats.extraccionesFallidas`. Esa pista le sirve al admin
  para corregir el regex.
- **Reanudación**: al reanudar una extracción parcial, **no se vuelve a
  evaluar la regla** — la reanudación solo reintenta chunks de OpenAI
  fallidos. La regla se aplica solo en la corrida inicial.

## Auto-generación de reglas (futuro)

Por ahora las reglas son **manuales**. Una iteración futura podría
generar regex sugeridos a partir de extracciones IA exitosas (alinear
movimientos extraídos con las líneas del PDF original y detectar
patrones consistentes). Si las reglas manuales prueban su valor,
priorizamos esa automatización después.
