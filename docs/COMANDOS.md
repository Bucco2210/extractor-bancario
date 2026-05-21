# Comandos — referencia rápida

Cheatsheet de todo lo que se corre habitualmente en este proyecto.

## Setup inicial

```bash
npm install
cp .env.example .env.local
# editar .env.local con valores reales (Mongo, OpenAI, AUTH_SECRET,
# APP_ENCRYPTION_KEY, etc — ver docs/DEPLOY_VERCEL.md)

npm run seed:perfiles   # upsert idempotente del catálogo de 17 entidades
npm run seed:admin      # crea/actualiza el usuario admin desde ADMIN_SEED_*
```

## Desarrollo

```bash
npm run dev             # Next.js dev server en :3000
```

## Cierre de fase / pre-commit

Estos cuatro pasos son los gates obligatorios al cerrar cualquier
sub-fase. Si alguno falla, no se commitea.

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Todo en uno (atajo informal):

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

## Tests focalizados

```bash
npm run test -- mercado-pago      # solo tests cuyo path matchea
npm run test -- tema             # solo dark mode
npm run test -- api-admin        # solo handlers admin
npm run test:watch                # watch mode
```

Coverage:

```bash
npm run test -- --coverage
```

## Mongo (dev local)

```bash
# Con Homebrew:
brew services start mongodb-community

# Con Docker:
docker run -d -p 27017:27017 --name bbtech-mongo mongo:7

# Inspección rápida con mongosh:
mongosh ethos_extractos
> db.usuarios.countDocuments()
> db.extracciones.find({ usuarioId: ObjectId("...") }).limit(5)
```

## Git

```bash
# El proyecto usa commits atómicos en español.
# Convención: "fase N (X/Y): título corto en minúscula"
# (ver git log para ejemplos)

git log --oneline -15
git status
```

## Troubleshooting

| Problema | Posible causa | Acción |
|---|---|---|
| `Variables de entorno inválidas` al arrancar | falta `APP_ENCRYPTION_KEY` (64 chars hex) o `AUTH_SECRET` (≥16 chars) | Generar con `openssl rand -hex 32` / `openssl rand -base64 32` |
| Extracción se queda en `procesando` | Proceso Next se reinició mid-job (fire-and-forget se perdió) | Tocar "Reanudar" en la UI o `POST /api/extracciones/[id]/reanudar` — el runner es idempotente y retoma desde los chunks pendientes |
| `429 LIMITE_EXCEDIDO` en local | usuario operador alcanzó el límite del ciclo | login como admin (que pasa el gate) o ajustar el plan desde `/admin/usuarios` |
| OpenAI rate-limited en bursts | varias extracciones simultáneas | bajar `EXTRACCION_CHUNKS_PARALELO` (default 3) |
| Modo oscuro "se rompe" al recargar | localStorage cleareado o `.dark` no aplica | revisar consola por errores del script anti-flash; ver `app/lib/tema.ts` |
| Conciliación devuelve 422 con headers | falta una columna requerida en el CSV/XLSX | el front muestra mini-mapeador in-line; mapear y reintentar con `mapeoOverride` |

## Comandos de admin (UI)

- `/admin` — dashboard de KPIs (admin-only).
- `/admin/usuarios` — invitar usuario (genera `/registro/<token>`).
- `/admin/pagos` — registrar pago manual (extiende ciclo).
- `/cuenta` — propio user: plan + KPIs personales (todos).

## Documentación viva relacionada

- `docs/ARQUITECTURA.md` — visión general, capas, flujo.
- `docs/DEPLOY_VERCEL.md` — checklist al reactivar deploy.
- `docs/MONETIZACION.md` — planes, plan-gate, admin, MP.
- `docs/PERFILES_EXTRACCION.md` — catálogo y CRUD.
- `docs/HOME_UX.md`, `docs/WORKSPACE.md` — patrones de UI.
- `docs/APRENDIZAJE.md` — huella + reglas determinísticas.
- `docs/CONCILIACION.md` — parser, matcheador, doble panel.
