# Deploy a Vercel

> **Estado vigente: deploy pausado por decisión del usuario.**
> Iteramos solo local — los pasos de cierre de fase son
> `lint + typecheck + test + build`. Cuando se reactive el deploy,
> esta guía cubre el setup completo de las 8 fases ya cerradas.

## Servicios externos requeridos

| Servicio | Rol | Notas |
|---|---|---|
| MongoDB Atlas | DB principal | M0 free alcanza para empezar. Usar SRV connection string. |
| Vercel Blob | Storage de archivos originales | Activar desde el dashboard del proyecto. |
| OpenAI | Motor de extracción | Modelo default `gpt-4o-mini`, fallback `gpt-4o`. |
| Mercado Pago | Pagos (opcional) | Solo cuando se active `MERCADO_PAGO_HABILITADO`. |

## Variables de entorno (en Vercel project settings)

Ver `.env.example` para la lista completa con defaults. Todas se validan
con zod en `app/lib/env.ts` al arrancar el server. Las críticas:

```
# Mongo
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
MONGODB_DB_NAME=ethos_extractos

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# OpenAI
OPENAI_API_KEY=sk-...

# Auth (generar con openssl rand -base64 32 / hex 32)
AUTH_SECRET=<32+ caracteres>
AUTH_URL=https://<dominio-vercel>
AUTH_TRUST_HOST=true
APP_ENCRYPTION_KEY=<64 chars hex>

# Mercado Pago (opcional, default OFF)
MERCADO_PAGO_HABILITADO=false
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=

# Seed inicial admin
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
ADMIN_SEED_NOMBRE="Admin B&B Tech"
```

## Pasos al reactivar

1. **Mongo Atlas**: crear cluster, network access (whitelist Vercel IPs
   o `0.0.0.0/0` con auth fuerte), database user con `readWrite`.
2. **Vercel project**: importar el repo, dejar Next 15 build defaults.
3. **Vercel Blob**: activar storage en el dashboard del proyecto y
   pegar `BLOB_READ_WRITE_TOKEN`. En `app/lib/blob.ts` la abstracción
   `getBlobStorage()` ya soporta swap entre memoria y Vercel Blob — al
   reactivar, completar la implementación de `VercelBlobStorage` con
   `@vercel/blob`.
4. **OpenAI**: pegar `OPENAI_API_KEY`. Activar rate-limit en el panel
   de OpenAI según el `LIMITE_TOKENS_MENSUAL` configurado.
5. **Auth**: generar `AUTH_SECRET` (`openssl rand -base64 32`),
   `APP_ENCRYPTION_KEY` (`openssl rand -hex 32`), setear `AUTH_URL` al
   dominio final, `AUTH_TRUST_HOST=true`.
6. **Seed**: correr `npm run seed:admin` y `npm run seed:perfiles`
   contra el Atlas desde local (los scripts leen las mismas env vars)
   o desde una Vercel function one-shot.
7. **Verificar**: login → upload de un PDF → extracción completa →
   export Excel. Si pasa, probar conciliación con un CSV simple.
8. **(Opcional) Mercado Pago**: cuando esté la cuenta de negocio,
   setear las 3 `MERCADO_PAGO_*`, configurar el webhook en el panel
   MP apuntando a `https://<dominio>/api/pagos/mercadopago/webhook`.
   Encender la flag activa el feature sin redeploy.
9. **Cuidado con PDFs largos**: en serverless el handler tiene
   `maxDuration: 300`. Como sacamos Inngest, las extracciones de
   Provincia (60+ páginas, ~5 min) podrían cortarse. Si pasa,
   reanudar con `POST /api/extracciones/[id]/reanudar` o re-introducir
   una cola (Inngest / BullMQ / Vercel Queue).

## Notas de compatibilidad

- Todos los endpoints declaran `runtime = "nodejs"`. `pdfjs-dist`
  legacy + `exceljs` requieren APIs Node (`Buffer`, `fs`, etc); no se
  pueden mover a Edge.
- **Cold starts**: Mongoose se cachea en `globalThis` (ver
  `app/lib/mongo.ts`); las primeras request del día pueden tardar
  300-800ms más mientras se levanta la conexión.
- **Extracciones largas**: la API responde inmediatamente con el
  `extraccionId` y el runner sigue corriendo fire-and-forget en el
  mismo proceso. El front polea `GET /api/extracciones/[id]`. El
  runner persiste cada chunk en `_meta.chunksCompletados[]` así que
  si se corta, se reanuda con `POST /api/extracciones/[id]/reanudar`.
- El blob no se persiste localmente (storage en memoria en dev);
  reiniciar el server pierde los uploads en curso. En prod con Vercel
  Blob esto no aplica.

## Limitaciones conocidas en deploy

- Sin email de invitación: el endpoint devuelve el link
  `/registro/<token>` para que el admin lo copie y lo mande
  manualmente. Si se quiere automatizar, integrar Resend / SES y
  cablear en `POST /api/admin/usuarios/invitar`.
- Sin OCR/vision: solo PDFs digitales (texto extraíble). Decisión
  vigente, no es una limitación a remediar.
- Mercado Pago no incluye UI de "crear preference" — el scaffolding
  cubre el webhook (recibir confirmación de pago). Para activar
  end-to-end falta el botón "Pagar con MP" en `/cuenta` que arme
  la preference y redirija al checkout.
