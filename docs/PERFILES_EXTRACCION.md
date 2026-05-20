# Perfiles de extracción

> Estado: Fase 2. Define cómo se modelan los perfiles, cómo se cargan las
> seeds iniciales y cómo agregar nuevos perfiles vía API.

## Concepto

Un **perfil de extracción** es la combinación de:

1. Una **entidad** (banco o billetera virtual) — ej. *Banco Galicia*, *Mercado Pago*.
2. Un **tipo de documento** — `extracto_bancario` | `tarjeta_credito` | `tarjeta_debito`.
3. Una **moneda primaria** — `ARS` | `USD`.

Cada perfil tiene su propio prompt y reglas. Una misma entidad puede tener
varios perfiles (ej. Galicia caja de ahorro ARS + Galicia caja de ahorro
USD + Galicia tarjeta de crédito Visa).

## Catálogo inicial (17 entidades)

Cada entidad arranca con **un perfil seed** de `extracto_bancario` en ARS.
Si necesitás otros tipos o monedas, los agregás vía `POST /api/perfiles`
(solo rol `admin`).

### Bancos (12)

| Entidad | Slug del perfil seed |
|---|---|
| Banco Galicia | `galicia_extracto_ars` |
| Banco Nación | `nacion_extracto_ars` |
| Banco Provincia | `provincia_extracto_ars` |
| Banco Ciudad | `ciudad_extracto_ars` |
| Banco Santander | `santander_extracto_ars` |
| BBVA Argentina | `bbva_extracto_ars` |
| Banco Macro | `macro_extracto_ars` |
| ICBC | `icbc_extracto_ars` |
| HSBC Argentina | `hsbc_extracto_ars` |
| Banco Supervielle | `supervielle_extracto_ars` |
| Banco Patagonia | `patagonia_extracto_ars` |
| Banco Credicoop | `credicoop_extracto_ars` |

### Billeteras (5)

| Entidad | Slug del perfil seed |
|---|---|
| Mercado Pago | `mercado_pago_extracto_ars` |
| Ualá | `uala_extracto_ars` |
| Naranja X | `naranja_x_extracto_ars` |
| Cuenta DNI | `cuenta_dni_extracto_ars` |
| Personal Pay | `personal_pay_extracto_ars` |

## Cargar / actualizar el catálogo

```bash
npm run seed:perfiles
```

El script es idempotente: hace `upsert` por `slug`. Correrlo dos veces no
duplica nada y los campos que cambies en `app/lib/seeds/perfiles.ts` se
sobrescriben en la próxima corrida.

## Agregar un perfil vía API

```bash
# Login admin previo (cookie de sesión necesaria)
curl -X POST http://localhost:3000/api/perfiles \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "galicia_tarjeta_credito_visa",
    "entidad": { "slug": "galicia", "nombre": "Banco Galicia" },
    "categoria": "banco",
    "nombre": "Resumen Tarjeta Crédito Visa",
    "tipoDocumento": "tarjeta_credito",
    "monedaPrimaria": "ARS",
    "huella": {
      "palabrasClave": ["Visa Galicia", "Resumen de cuenta - Tarjeta"]
    },
    "ordenEnGrid": 15
  }'
```

Validaciones (zod en `app/lib/perfiles-schema.ts`):

- `slug`: `^[a-z0-9_]+$`, longitud 2–80, único en la colección.
- `categoria`: solo `banco | billetera`.
- `tipoDocumento`: solo `extracto_bancario | tarjeta_credito | tarjeta_debito`.
- `monedaPrimaria`: solo `ARS | USD`.
- `validacionesEspeciales[].tipo`: enum cerrado
  (`moneda_obligatoria | encabezado_obligatorio | palabra_clave_prohibida | regex_match`).

## Detector de perfil

Con el catálogo cargado, el endpoint `POST /api/perfiles/detectar` recibe
un texto y devuelve los perfiles más probables:

```bash
curl -X POST http://localhost:3000/api/perfiles/detectar \
  -H "Content-Type: application/json" \
  -d '{
    "texto": "BANCO GALICIA - Caja de Ahorro en Pesos - Período 10/2025...",
    "topN": 3
  }'
```

Respuesta:

```json
{
  "mejor": {
    "perfilId": "65a1...",
    "slug": "galicia_extracto_ars",
    "score": 0.93,
    "razones": ["el encabezado dice 'BANCO GALICIA'", "menciona Caja de Ahorro"]
  },
  "candidatos": [
    { "perfilId": "65a1...", "slug": "galicia_extracto_ars", "score": 0.93, "razones": [...] }
  ],
  "_meta": {
    "modelo": "gpt-4o-mini",
    "tokensInput": 1234,
    "tokensOutput": 56,
    "tiempoMs": 845,
    "totalCandidatos": 17
  }
}
```

Umbral para auto-asignar perfil: `score >= 0.85` (constante
`UMBRAL_AUTO_DETECCION` en `app/api/extracciones/route.ts`, alineado con
spec §5.3).

Desde Fase 3 el detector **también corre internamente** en
`POST /api/extracciones` cuando no viene `perfilId` ni `banco`. La
respuesta incluye un campo `deteccion` con `mejor`, `candidatos` y el
flag `auto` (true si se asignó perfil automáticamente). Cuando el
score no alcanza el umbral, la Home muestra un modal con los candidatos
para confirmar manualmente (ver [docs/HOME_UX.md](./HOME_UX.md)).

## Endpoints CRUD

| Método | Ruta | Auth | Comentario |
|---|---|---|---|
| `GET` | `/api/perfiles` | Sesión | Filtros: `categoria`, `entidad`, `tipoDocumento`, `activo`, `q`, `limite` |
| `POST` | `/api/perfiles` | Admin | Body con shape de `perfilCreateSchema` |
| `GET` | `/api/perfiles/[id]` | Sesión | |
| `PATCH` | `/api/perfiles/[id]` | Admin | Partial update |
| `DELETE` | `/api/perfiles/[id]` | Admin | Soft delete (`activo: false`) |
| `POST` | `/api/perfiles/detectar` | Sesión | |

## Cómo agregar una entidad nueva al catálogo seed

1. Editar `app/lib/seeds/perfiles.ts` y agregar un nuevo item con:
   - `slug` único (ej. `brubank_extracto_ars`).
   - `entidad.slug` único entre entidades (ej. `brubank`).
   - Palabras clave específicas en `huella.palabrasClave`.
2. Actualizar la cuenta esperada en `tests/perfiles-seeds.test.ts`.
3. Correr `npm run test` y `npm run seed:perfiles`.
4. Actualizar el catálogo de este documento.
