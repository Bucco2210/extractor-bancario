# Inngest — jobs durables

Migración del fire-and-forget (`void correrExtraccion(...)`) a jobs
durables con Inngest. Garantiza:

- Supervivencia a restart del proceso (Vercel kill, deploy, restart local).
- Reintentos automáticos con backoff (default 2 reintentos sobre fallo
  no-NonRetriable).
- Observabilidad via dashboard local (`http://localhost:8288` en dev).

## Arquitectura

```
POST /api/extracciones
  └─ persiste doc + dispararExtraccion()
       └─ inngest.send({ name: "extraccion.procesar", data })
            └─ Inngest dev-server (en dev) o Inngest Cloud (en prod)
                 └─ POST /api/inngest  ← endpoint que sirve la función
                      └─ procesarExtraccionFn
                           └─ correrExtraccion()  ← lógica existente, idempotente
```

Idempotencia: `correrExtraccion()` ya marca chunks completados en
`_meta.chunksCompletados[]`. Si Inngest reintenta el job, los chunks ya
hechos no se re-procesan (el matcheo por `extraccionId` + idx del chunk
hace el rest).

## Payload del evento

El evento `extraccion.procesar` lleva todo lo necesario para arrancar:

```ts
{
  extraccionId: string;
  motivo: "inicial" | "reanudar";
  banco: string | null;
  huella: string | null;
  resumenHuella: string | null;
  perfilId: string | null;
  chunks: Array<{
    indice: number;
    paginas: Array<{ numero: number; texto: string }>;
  }>;
}
```

**Límite conocido**: Inngest acepta ~512 KB por evento. Para extractos
muy largos (>40 páginas con texto denso) puede acercarse al borde. Si
en producción aparece, migrar a evento minimal (`extraccionId` solamente)
+ re-extracción del PDF dentro del job desde el blob.

## Modo dev

```bash
# En una terminal: levantar la app
npm run dev

# En otra terminal: levantar el dev-server Inngest
npx inngest-cli@latest dev

# Dashboard: http://localhost:8288
```

El binario se descarga al primer uso vía `npx`. No suma deps al
`package.json`.

## Modo prod (cuando se reactive Vercel)

1. Crear app en https://app.inngest.com.
2. Configurar env vars en Vercel:
   - `INNGEST_EVENT_KEY` (para emitir eventos)
   - `INNGEST_SIGNING_KEY` (para verificar webhooks)
   Ya están declaradas en `app/lib/env.ts`.
3. Registrar el endpoint `/api/inngest` en el dashboard de Inngest Cloud.

## Archivos

- `app/lib/inngest.ts` — cliente + helper `dispararExtraccion()` tipado.
- `app/lib/inngest-funciones/procesar-extraccion.ts` — función que
  envuelve `correrExtraccion()`.
- `app/api/inngest/route.ts` — endpoint Inngest (GET/POST/PUT).
- `tests/inngest-disparar.test.ts` — tests del wrapper.

## Reintentos

Configurados a 2 reintentos por función (`retries: 2` en
`procesar-extraccion.ts`). Sumado al intento original, son 3 ejecuciones
totales antes de marcar el job como definitivamente fallido. El backoff
exponencial lo aplica Inngest automáticamente.

Para forzar que un error NO se reintente, lanzar `NonRetriableError`
de `inngest` dentro del handler (ej. payload inválido).
