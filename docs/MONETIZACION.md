# Monetización — planes, invitaciones, pagos y admin

Cierre de **Fase 9**. Cubre la matriz comercial, el flujo de acceso por
invitación, el plan-gate que bloquea uso una vez alcanzado el límite,
el panel admin y el scaffolding de Mercado Pago detrás de flag.

## Matriz de planes

Vive en `app/lib/planes.ts` (no en DB) porque es contrato comercial:
cambia raramente y siempre con deploy. Precios en USD; ciclo anual =
10× el mensual (2 meses gratis).

| Plan      | Precio mensual | Extracciones/ciclo | Conciliaciones/ciclo |
|-----------|---------------:|-------------------:|---------------------:|
| Trial     | gratis 10 días |                  3 |                    0 |
| Plus      |          $19   |                 20 |                    0 |
| Pro       |          $49   |                 75 |                   10 |
| Premium   |          $99   |                250 |                    ∞ |

`Infinity` = sin tope (el gate lo trata como skip). `0` = feature no
incluida (el botón "Conciliar" no se muestra). Helpers públicos:
`planExiste`, `duracionCicloMs`, `calcularFinCiclo`, `PLAN_DEFAULT`.

## Modelo de acceso: solo por invitación

No hay signup público. El flujo es:

1. **Admin** entra a `/admin/usuarios`, completa email + plan sugerido,
   y `POST /api/admin/usuarios/invitar` genera un token (32 bytes hex,
   64 chars) con expiración (default 7 días).
2. El componente muestra el link `/registro/<token>`. El admin lo copia
   y lo manda por su canal habitual (email, WhatsApp, etc.).
3. El invitado entra al link público (whitelist en `proxy.ts`), ve a
   qué plan accede y setea su contraseña.
4. `POST /api/auth/aceptar-invitacion` crea el `Usuario` (rol
   `operador`), arma el `planInfo` con `calcularFinCiclo()` y marca la
   `Invitacion` como `usadaEn=now`.
5. El invitado entra a `/login?registro=ok`.

Validaciones del lado del endpoint público:
- token existe y no está usado
- `expiraEn > now`
- no existe ya un `Usuario` con ese email
- contraseña mínima 8 caracteres

## Plan-gate

`app/lib/plan-gate.ts` corre **antes** de cualquier trabajo pesado en
`POST /api/extracciones` y `POST /api/conciliaciones`. Reglas:

- `rol === "admin"` → pasa sin chequeo (sin límites por decisión de
  producto).
- usuario sin `planInfo` (legacy / pre-Fase 9) → bootstrap automático a
  `trial`.
- `cicloFin < now` y plan trial → marca `estadoCuenta="vencida"` y
  bloquea con 429.
- `cicloFin < now` y plan pago → rota la ventana (`cicloInicio = now`,
  `cicloFin = calcularFinCiclo`) y resetea contadores.
- `estadoCuenta ∈ {vencida, suspendida}` → modo lectura (bloquea
  creación pero permite GET + export Excel de extractos viejos).
- `extraccionesEnPeriodo >= limite` → 429 `LIMITE_EXCEDIDO` con mensaje
  claro.

Incremento de contadores es **atómico** vía `$inc`. Si dos requests en
paralelo entran al borde, se permite +1-2 sobre el límite y el siguiente
bloquea — suficiente para el caso de uso (la alternativa de transacción
distribuida no se justifica).

## Panel admin

Todas las rutas `/admin/*` y `/api/admin/*` gateadas con
`requerirRol("admin")` (redirect a `/` o 403, según contexto).

| Ruta | Qué hace |
|------|----------|
| `/admin` | Dashboard con KPIs: usuarios totales / por plan / por estado, extracciones totales + últimos 30 días, conciliaciones, tokens consumidos, ingresos confirmados por moneda. |
| `/admin/usuarios` | Tabla con filtros + componente `InvitarUsuario` (genera link). |
| `/admin/pagos` | Historial + componente `RegistrarPagoManual` (sugiere monto según plan/ciclo). |
| `/cuenta` | Vista del usuario: plan, ciclo, barras de uso, alerta de modo lectura cuando vence. |

Endpoints internos: ver `app/api/admin/*` (CRUD usuarios, pagos, métricas)
y `app/api/usuarios/me/plan/route.ts` (self-service de info del plan).

## Pagos manuales

Mientras MP no está habilitado, todo se factura por afuera y el admin
deja registro acá. `POST /api/admin/pagos`:

1. Snapshot del plan/ciclo/monto/moneda → modelo `Pago` con
   `fuente="manual"`, `estado="confirmado"`.
2. Extiende la ventana del plan del usuario:
   - Si la ventana actual sigue vigente y mismo plan → suma duración
     desde `cicloFin` (no quema "días gratis" del usuario).
   - Si vencida o cambia de plan → abre ventana fresca desde `now`
     y resetea contadores.

## Mercado Pago (detrás de flag)

Scaffolding completo, **apagado por default**. Para activar:

1. Crear cuenta de negocio MP, obtener Access Token y Webhook Secret.
2. En `.env.local`:
   ```
   MERCADO_PAGO_HABILITADO=true
   MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...
   MERCADO_PAGO_WEBHOOK_SECRET=...
   ```
3. Configurar el webhook del panel MP apuntando a
   `https://<host>/api/pagos/mercadopago/webhook`.
4. (Front, no incluido) Al armar la preference, mandar:
   - `external_reference = usuarioId`
   - `metadata = { plan: "pro", cicloFacturacion: "mensual" }`

### Flujo del webhook (`app/api/pagos/mercadopago/webhook/route.ts`)

1. Si `MERCADO_PAGO_HABILITADO=false` → **503** (no se reintenta hasta
   activar). Esto significa: encender la flag = encender el feature, sin
   redeploy.
2. Parsear `x-signature` (`ts=...,v1=...`) y `x-request-id`.
3. Validar HMAC contra `MERCADO_PAGO_WEBHOOK_SECRET` (`verificarFirmaWebhook`
   en `app/lib/mercado-pago.ts`, usa `timingSafeEqual`).
4. `GET /v1/payments/{id}` con el Access Token.
5. Normalizar el payload con `pagoDesdePayloadMP()` (extrae usuarioId,
   plan, ciclo, monto, estado).
6. **Idempotencia**: buscar `Pago` por `(fuente=mercadopago, mpPaymentId)`.
   Si existe → 200 `{ duplicado: true }`.
7. Si el payment está `approved` → extiende la ventana del plan (mismo
   algoritmo que pagos manuales). Si está `pending` o `rejected`, se
   registra el `Pago` igual (auditoría) pero no toca el plan.

Códigos de respuesta pensados para MP:
- **5xx** → MP reintenta (errores reales de servidor / red).
- **2xx** → MP no reintenta (incluye 200 + `ignorado: true` para casos
  como "usuario inexistente" o "plan inválido" — evita que MP nos golpee
  para siempre con un payload roto).
- **401** firma inválida (no procesa, no aceptamos como duplicado).

### Helpers puros (`app/lib/mercado-pago.ts`)

- `parsearSignatureHeader(header)` — devuelve `{ ts, v1 }` o null.
- `verificarFirmaWebhook({ secret, signature, requestId, dataId })` —
  bool comparado con `timingSafeEqual`.
- `pagoDesdePayloadMP(payment)` — normaliza el `MercadoPagoPayment` al
  shape interno (`DatosPagoNormalizados`), valida external_reference +
  metadata.plan + ciclo + monto > 0, mapea status MP → estado interno.

Sin lado-efectos: testeable como módulo puro
(`tests/mercado-pago.test.ts`).

## Tests

- `tests/planes.test.ts` (15) — matriz, helpers, cálculo de ciclos.
- `tests/plan-gate.test.ts` (12) — admin pass, bootstrap, rotación,
  vencimiento, límites, suspensión.
- `tests/api-admin.test.ts` (23) — invitación, aceptación, listados,
  pagos manuales, métricas, role gate, paths de error.
- `tests/mercado-pago.test.ts` (16) — parser/firma/normalización.
- `tests/api-mercado-pago-webhook.test.ts` (12) — flag, headers, firma,
  fetch, idempotencia, payment pendiente, usuario inexistente, plan
  inválido.

Total Fase 9: **78 tests nuevos**. La suite completa pasa 406/406.

## Variables de entorno

```
# Mercado Pago (fase 9, feature flag)
MERCADO_PAGO_HABILITADO=false
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
```

(El resto del bloque comercial — duración trial, precios, límites —
vive en `app/lib/planes.ts`, no en env.)
