import "server-only";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { Extraccion } from "@/models/Extraccion";
import { procesarChunks, type ChunkDefinicion } from "@/lib/openai";
import { logger } from "@/lib/logger";
import { registrarFormatoTrasIA } from "@/lib/aprendizaje";

type CorrerParams = {
  extraccionId: string;
  chunks: ChunkDefinicion[];
  banco?: string | null;
  motivo: "inicial" | "reanudar";
  /** Huella del documento, calculada antes de invocar al runner. */
  huella?: string | null;
  /** Resumen normalizado de la huella (debug en /formatos). */
  resumenHuella?: string | null;
  /** Perfil ya asignado a la extracción (si lo hay). */
  perfilId?: Types.ObjectId | null;
};

const INTENTOS_MONGO = 4;
const BACKOFF_BASE_MS = 500;

/**
 * Reintenta una operación de Mongo con backoff exponencial. Pensado para
 * sobrevivir caídas transitorias del pool (p.ej. monitor timeout en local
 * cuando los workers están bloqueados en OpenAI durante mucho tiempo).
 */
async function conReintentosMongo<T>(
  fn: () => Promise<T>,
  contexto: string,
  extraccionId: string,
): Promise<T> {
  let ultimoErr: unknown;
  for (let intento = 1; intento <= INTENTOS_MONGO; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErr = err;
      const mensaje = err instanceof Error ? err.message : String(err);
      logger.warn(
        { extraccionId, contexto, intento, error: mensaje },
        "[runner] reintentando op Mongo",
      );
      if (intento < INTENTOS_MONGO) {
        const espera = BACKOFF_BASE_MS * Math.pow(2, intento - 1);
        await new Promise((r) => setTimeout(r, espera));
        try {
          await conectarMongoose();
        } catch {
          // si falla la reconexión, el próximo intento la vuelve a probar
        }
      }
    }
  }
  throw ultimoErr;
}

/**
 * Procesa los chunks indicados llamando OpenAI y persistiendo el avance
 * por chunk en Mongo. Pensado para ser invocado "fire-and-forget" desde
 * un endpoint: el cliente sigue el progreso via polling.
 *
 * Al terminar setea `estado` final: `extraido` si todos los chunks
 * cerraron OK o `parcial` si quedó alguno fallido. Si algo catastrófico
 * rompe el flujo entero, decide entre `parcial` (si ya hay movimientos
 * persistidos, así el usuario puede reanudar) y `error` (si no hay nada).
 */
export async function correrExtraccion(params: CorrerParams): Promise<void> {
  const inicio = Date.now();
  const { extraccionId, chunks, banco, motivo } = params;

  try {
    await conectarMongoose();
    logger.info(
      { extraccionId, motivo, chunksAProcesar: chunks.length },
      "[runner] inicio",
    );

    await procesarChunks({
      chunks,
      banco: banco ?? undefined,
      onChunkOk: async (info) => {
        const setSiNulo: Record<string, string> = {};
        if (info.resultado.cuenta) setSiNulo.cuenta = info.resultado.cuenta;
        if (info.resultado.periodo) setSiNulo.periodo = info.resultado.periodo;
        if (info.resultado.titular) setSiNulo.titular = info.resultado.titular;

        await conReintentosMongo(
          () =>
            Extraccion.updateOne(
              { _id: new Types.ObjectId(extraccionId) },
              {
                $push: {
                  movimientos: { $each: info.resultado.movimientos },
                  "_meta.chunksCompletados": info.indice,
                },
                $pull: {
                  "_meta.chunksFallidos": { indice: info.indice },
                },
                $inc: {
                  "_meta.chunksOk": 1,
                  "_meta.tokensInput": info.meta.tokensInput,
                  "_meta.tokensOutput": info.meta.tokensOutput,
                  "_meta.tiempoMs": info.ms,
                },
              },
            ),
          "persistir chunk ok",
          extraccionId,
        );

        for (const [campo, valor] of Object.entries(setSiNulo)) {
          await conReintentosMongo(
            () =>
              Extraccion.updateOne(
                { _id: new Types.ObjectId(extraccionId), [campo]: null },
                { $set: { [campo]: valor } },
              ),
            `setSiNulo ${campo}`,
            extraccionId,
          );
        }

        logger.info(
          {
            extraccionId,
            chunk: info.indice,
            paginas: info.paginas,
            movimientos: info.resultado.movimientos.length,
            ms: info.ms,
          },
          "[runner] chunk ok",
        );
      },
      onChunkFalla: async (info) => {
        await conReintentosMongo(
          () =>
            Extraccion.updateOne(
              { _id: new Types.ObjectId(extraccionId) },
              {
                $push: {
                  "_meta.chunksFallidos": {
                    indice: info.indice,
                    paginas: info.paginas,
                    error: info.error,
                  },
                },
                $inc: { "_meta.tiempoMs": info.ms },
              },
            ),
          "persistir chunk falla",
          extraccionId,
        );
        logger.warn(
          {
            extraccionId,
            chunk: info.indice,
            paginas: info.paginas,
            ms: info.ms,
            error: info.error,
          },
          "[runner] chunk falló",
        );
      },
    });

    const doc = await conReintentosMongo(
      () =>
        Extraccion.findById(extraccionId)
          .select({ "_meta.chunksFallidos": 1 })
          .lean(),
      "leer estado final",
      extraccionId,
    );
    const hayFallidos = (doc?._meta?.chunksFallidos?.length ?? 0) > 0;
    const estadoFinal: "extraido" | "parcial" = hayFallidos ? "parcial" : "extraido";

    // Si quedó completo y tenemos huella + perfil, upsert al
    // FormatoAprendido para que aparezca en /formatos. Solo registramos
    // en la corrida "inicial" — la reanudación no cambia la huella ni
    // crea un formato nuevo.
    let formatoAprendidoId: Types.ObjectId | null = null;
    if (
      motivo === "inicial" &&
      estadoFinal === "extraido" &&
      params.huella &&
      params.perfilId
    ) {
      try {
        formatoAprendidoId = await registrarFormatoTrasIA({
          huella: params.huella,
          resumenHuella: params.resumenHuella ?? "",
          perfilId: params.perfilId,
        });
      } catch (err) {
        logger.warn(
          { err, extraccionId },
          "[runner] no pude registrar el formato aprendido",
        );
      }
    }

    const setFinal: Record<string, unknown> = {
      estado: estadoFinal,
      error: null,
    };
    if (formatoAprendidoId) setFinal.formatoAprendidoId = formatoAprendidoId;

    await conReintentosMongo(
      () =>
        Extraccion.updateOne(
          { _id: new Types.ObjectId(extraccionId) },
          { $set: setFinal },
        ),
      "set estado final",
      extraccionId,
    );

    logger.info(
      {
        extraccionId,
        motivo,
        estadoFinal,
        formatoAprendidoId: formatoAprendidoId
          ? String(formatoAprendidoId)
          : null,
        totalMs: Date.now() - inicio,
      },
      "[runner] fin",
    );
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    logger.error({ err, extraccionId }, "[runner] fallo catastrófico");

    try {
      const doc = await conReintentosMongo(
        () =>
          Extraccion.findById(extraccionId)
            .select({ movimientos: 1, "_meta.chunksOk": 1, "_meta.chunksTotal": 1 })
            .lean(),
        "leer estado tras fallo",
        extraccionId,
      );
      const hayAvance =
        (doc?.movimientos?.length ?? 0) > 0 || (doc?._meta?.chunksOk ?? 0) > 0;
      const estadoFinal: "parcial" | "error" = hayAvance ? "parcial" : "error";

      await conReintentosMongo(
        () =>
          Extraccion.updateOne(
            { _id: new Types.ObjectId(extraccionId) },
            {
              $set: {
                estado: estadoFinal,
                error: estadoFinal === "parcial" ? null : mensaje,
              },
            },
          ),
        "set estado tras fallo",
        extraccionId,
      );
      logger.warn(
        { extraccionId, estadoFinal, hayAvance },
        "[runner] estado persistido tras fallo catastrófico",
      );
    } catch (errPersist) {
      logger.error(
        { err: errPersist, extraccionId },
        "[runner] no se pudo persistir estado tras fallo",
      );
    }
  }
}
