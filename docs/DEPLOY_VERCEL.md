# Deploy a Vercel

> **Estado: pendiente.** Esta guía se completa cuando arranque la conexión a Vercel (fase posterior a Fase 1).
> Por ahora todo corre local; el código ya está preparado para serverless (conexiones a Mongo cacheadas, no hay persistencia en disco, blob abstraído).

## TODO al iniciar el deploy

1. Crear proyecto en Vercel apuntando al repo.
2. Crear MongoDB Atlas (M0 free) y cargar `MONGODB_URI`.
3. Activar **Vercel Blob** en el proyecto y copiar `BLOB_READ_WRITE_TOKEN`.
4. Cargar el resto de variables de entorno (ver `.env.example`).
5. Implementar `VercelBlobStorage implements BlobStorage` en `app/lib/blob.ts` y hacer que `getBlobStorage()` la elija cuando `BLOB_READ_WRITE_TOKEN` está presente.
6. Generar `AUTH_SECRET` con `openssl rand -base64 32` y `APP_ENCRYPTION_KEY` con `openssl rand -hex 32`.
7. Setear `AUTH_URL` al dominio final del deploy.
8. Verificar que el seed admin (`npm run seed:admin`) corra contra el Atlas — o crear el usuario con un script equivalente en producción.
9. Probar el flujo completo: login → upload → extracción → export Excel.

## Notas de compatibilidad

- `app/api/extracciones/route.ts` declara `runtime = "nodejs"` porque `pdfjs-dist` legacy requiere `Buffer` y APIs node.
- El endpoint Excel también usa `nodejs` porque `exceljs` depende de Node.
- Mongoose maneja la conexión cacheada en `globalThis` para no agotar pools en cold-starts.
