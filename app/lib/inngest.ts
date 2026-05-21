import "server-only";
import { Inngest } from "inngest";

/**
 * Cliente Inngest para B&B Tech. Único punto de entrada para emitir
 * eventos que disparan jobs durables (con reintentos, supervivencia a
 * restart, observabilidad).
 *
 * En dev: corre con el binario local `npx inngest-cli@latest dev` —
 * levanta un dashboard en http://localhost:8288 y proxea eventos al
 * endpoint `/api/inngest` de la app.
 *
 * En prod (cuando reactivemos Vercel): registrar el endpoint en Inngest
 * Cloud y configurar INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY (ya están
 * declaradas en `app/lib/env.ts`).
 */

/** Payload del evento que dispara la extracción asíncrona. */
export type EventoExtraccionProcesar = {
  data: {
    extraccionId: string;
    motivo: "inicial" | "reanudar";
    banco: string | null;
    huella: string | null;
    resumenHuella: string | null;
    perfilId: string | null;
    /**
     * Chunks ya armados con el texto de cada página. Esto evita re-extraer
     * el PDF en el job. Para extractos muy largos (>40 pág densas) puede
     * acercarse al límite de 512 KB de payload Inngest; en ese caso
     * habría que pasar a un esquema de "minimal event + re-extracción".
     */
    chunks: Array<{
      indice: number;
      paginas: Array<{ numero: number; texto: string }>;
    }>;
  };
};

type EventosInngest = {
  "extraccion.procesar": EventoExtraccionProcesar;
};

export const inngest = new Inngest({
  id: "bb-tech-extractor",
  // El esquema tipado se aplica vía generic `send` helper más abajo.
});

/**
 * Helper tipado para emitir el evento de extracción. Garantiza shape
 * correcto en todos los call-sites (POST inicial y reanudación).
 */
export async function dispararExtraccion(
  data: EventoExtraccionProcesar["data"],
): Promise<void> {
  await inngest.send({
    name: "extraccion.procesar" satisfies keyof EventosInngest,
    data,
  });
}
