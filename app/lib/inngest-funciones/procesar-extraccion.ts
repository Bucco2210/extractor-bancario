import "server-only";
import { Types } from "mongoose";
import { inngest, type EventoExtraccionProcesar } from "@/lib/inngest";
import { correrExtraccion } from "@/lib/extraccion-runner";
import { logger } from "@/lib/logger";

/**
 * Función Inngest que envuelve `correrExtraccion()` con un job durable.
 *
 * Reintentos: por default Inngest reintenta 3 veces con backoff
 * exponencial. `correrExtraccion()` ya es idempotente (cada chunk se
 * procesa una vez vía `chunksCompletados[]`), así que reintentos del
 * job entero son seguros: los chunks ya hechos se saltean al
 * re-procesarse.
 */
export const procesarExtraccionFn = inngest.createFunction(
  {
    id: "extraccion-procesar",
    name: "Procesar extracción bancaria",
    retries: 2,
    triggers: [{ event: "extraccion.procesar" }],
  },
  async ({ event, step }) => {
    const data = (event as unknown as { data: EventoExtraccionProcesar["data"] })
      .data;

    await step.run("correr-extraccion", async () => {
      logger.info(
        {
          extraccionId: data.extraccionId,
          motivo: data.motivo,
          chunks: data.chunks.length,
        },
        "[inngest] procesando extracción",
      );

      await correrExtraccion({
        extraccionId: data.extraccionId,
        chunks: data.chunks,
        banco: data.banco,
        motivo: data.motivo,
        huella: data.huella,
        resumenHuella: data.resumenHuella,
        perfilId: data.perfilId
          ? new Types.ObjectId(data.perfilId)
          : null,
      });

      return { extraccionId: data.extraccionId, ok: true };
    });

    return { extraccionId: data.extraccionId };
  },
);
