import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { extraerTextoPdf } from "@/lib/pdf";
import { getBlobStorage } from "@/lib/blob";
import { Extraccion } from "@/models/Extraccion";
import { AppError, respuestaError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { correrExtraccion } from "@/lib/extraccion-runner";
import type { ChunkDefinicion } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new AppError("SIN_AUTH", "Debés iniciar sesión.");

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("INPUT_INVALIDO", "ID inválido.");
    }

    await conectarMongoose();
    const doc = await Extraccion.findOne({
      _id: id,
      usuarioId: session.user.id,
    }).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Extracción no encontrada.");

    if (doc.estado === "procesando") {
      throw new AppError(
        "NO_PROCESABLE",
        "La extracción ya está en curso. Esperá a que termine.",
      );
    }
    if (doc.estado === "extraido") {
      throw new AppError(
        "NO_PROCESABLE",
        "La extracción ya está completa, no hay nada que reanudar.",
      );
    }

    const completados = new Set(doc._meta.chunksCompletados ?? []);
    const pendientesDef = (doc._meta.chunksDefinicion ?? []).filter(
      (c) => !completados.has(c.indice),
    );

    if (pendientesDef.length === 0) {
      await Extraccion.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { estado: "extraido", error: null } },
      );
      throw new AppError(
        "NO_PROCESABLE",
        "No hay chunks pendientes. La extracción quedó marcada como completa.",
      );
    }

    if (!doc.archivo?.blobKey) {
      throw new AppError(
        "NO_PROCESABLE",
        "No se encuentra el archivo original para reanudar. Volvé a subirlo.",
      );
    }

    let buffer: Buffer;
    try {
      buffer = await getBlobStorage().descargar(doc.archivo.blobKey);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      logger.warn(
        { extraccionId: id, blobKey: doc.archivo.blobKey, err: mensaje },
        "no se pudo descargar blob para reanudar",
      );
      throw new AppError(
        "NO_PROCESABLE",
        "El archivo original ya no está disponible (puede haberse perdido al reiniciar el server). Volvé a subirlo.",
      );
    }

    const textoPdf = await extraerTextoPdf(buffer);
    const paginasPorNumero = new Map(
      textoPdf.paginas.map((p) => [p.numero, p]),
    );

    const chunksAProcesar: ChunkDefinicion[] = [];
    for (const def of pendientesDef) {
      const paginas = def.paginas
        .map((n) => paginasPorNumero.get(n))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));
      if (paginas.length === 0) continue;
      chunksAProcesar.push({ indice: def.indice, paginas });
    }

    if (chunksAProcesar.length === 0) {
      throw new AppError(
        "NO_PROCESABLE",
        "No se pudieron reconstruir las páginas pendientes desde el archivo original.",
      );
    }

    const indicesAReintentar = chunksAProcesar.map((c) => c.indice);
    const transicion = await Extraccion.updateOne(
      {
        _id: new Types.ObjectId(id),
        estado: { $in: ["parcial", "pendiente", "error"] },
      },
      {
        $set: { estado: "procesando", error: null },
        $pull: {
          "_meta.chunksFallidos": { indice: { $in: indicesAReintentar } },
        },
      },
    );
    if (transicion.modifiedCount === 0) {
      throw new AppError(
        "NO_PROCESABLE",
        "No se pudo iniciar la reanudación (otra corrida está en curso).",
      );
    }

    logger.info(
      {
        extraccionId: id,
        chunksPendientes: chunksAProcesar.length,
        indices: indicesAReintentar,
      },
      "reanudación iniciada",
    );

    void correrExtraccion({
      extraccionId: id,
      chunks: chunksAProcesar,
      banco: doc.banco,
      motivo: "reanudar",
    });

    return NextResponse.json(
      {
        id,
        estado: "procesando" as const,
        chunksAProcesar: chunksAProcesar.length,
        chunksTotal: doc._meta.chunksTotal,
      },
      { status: 202 },
    );
  } catch (err) {
    return respuestaError(err);
  }
}
