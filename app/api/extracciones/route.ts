import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { extraerTextoPdf, tieneTextoSuficiente } from "@/lib/pdf";
import { extraerMovimientosDeChunks } from "@/lib/openai";
import { getBlobStorage } from "@/lib/blob";
import { Extraccion } from "@/models/Extraccion";
import { AppError, respuestaError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const formSchema = z.object({
  banco: z.string().trim().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError("SIN_AUTH", "Debés iniciar sesión.");
    }

    const env = getEnv();
    const formData = await req.formData();
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File)) {
      throw new AppError("INPUT_INVALIDO", "Falta el archivo a extraer (campo 'archivo').");
    }

    const meta = formSchema.safeParse({ banco: formData.get("banco") ?? undefined });
    if (!meta.success) {
      throw new AppError("INPUT_INVALIDO", "Parámetros inválidos.", meta.error.issues);
    }

    const tamanoMax = env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (archivo.size > tamanoMax) {
      throw new AppError(
        "INPUT_INVALIDO",
        `El archivo supera el límite de ${env.MAX_FILE_SIZE_MB} MB.`,
      );
    }
    if (!env.ALLOWED_MIME_TYPES.includes(archivo.type)) {
      throw new AppError(
        "INPUT_INVALIDO",
        `Tipo de archivo no permitido: ${archivo.type || "(desconocido)"}`,
      );
    }

    const t0 = Date.now();
    const buffer = Buffer.from(await archivo.arrayBuffer());
    logger.info(
      { archivo: archivo.name, tamanoKB: Math.round(archivo.size / 1024) },
      "[1/5] archivo recibido",
    );

    if (archivo.type !== "application/pdf") {
      throw new AppError(
        "NO_PROCESABLE",
        "Por ahora solo se procesan PDFs digitales en Fase 1.",
      );
    }

    const tPdf = Date.now();
    const textoPdf = await extraerTextoPdf(buffer);
    logger.info(
      {
        paginas: textoPdf.totalPaginas,
        chars: textoPdf.textoCompleto.length,
        ms: Date.now() - tPdf,
      },
      "[2/5] PDF parseado",
    );
    if (!tieneTextoSuficiente(textoPdf)) {
      throw new AppError(
        "NO_PROCESABLE",
        "El PDF no tiene texto extraíble (posiblemente escaneado). OCR llega en fase posterior.",
      );
    }

    const tBlob = Date.now();
    const blob = await getBlobStorage().subir({
      nombre: archivo.name,
      contentType: archivo.type,
      data: buffer,
    });
    logger.info({ ms: Date.now() - tBlob }, "[3/5] blob guardado");

    const tIA = Date.now();
    logger.info(
      {
        modelo: env.OPENAI_MODEL_DEFAULT,
        paginas: textoPdf.totalPaginas,
        paginasPorChunk: env.EXTRACCION_PAGINAS_POR_CHUNK,
        concurrencia: env.EXTRACCION_CHUNKS_PARALELO,
      },
      "[4/5] llamando OpenAI por chunks…",
    );

    const { resultado, meta: metaExtraccion } = await extraerMovimientosDeChunks({
      paginas: textoPdf.paginas,
      banco: meta.data.banco,
      onChunkProgreso: (info) => {
        if (info.ok) {
          logger.info(
            {
              chunk: `${info.indice + 1}/${info.total}`,
              paginas: info.paginas,
              ms: info.ms,
              movimientos: info.movimientos ?? 0,
            },
            "chunk ok",
          );
        } else {
          logger.warn(
            {
              chunk: `${info.indice + 1}/${info.total}`,
              paginas: info.paginas,
              ms: info.ms,
              error: info.error,
            },
            "chunk falló",
          );
        }
      },
    });

    logger.info(
      {
        ms: Date.now() - tIA,
        chunksOk: metaExtraccion.chunksOk,
        chunksTotal: metaExtraccion.chunksTotal,
        chunksFallidos: metaExtraccion.chunksFallidos.length,
        movimientos: resultado.movimientos.length,
        tokens: metaExtraccion.tokensInput + metaExtraccion.tokensOutput,
      },
      "[4/5] OpenAI terminó",
    );

    if (metaExtraccion.chunksTotal === 0 || metaExtraccion.chunksOk === 0) {
      throw new AppError(
        "NO_PROCESABLE",
        metaExtraccion.chunksFallidos[0]?.error ??
          "No se pudo extraer ningún chunk del documento.",
        { chunksFallidos: metaExtraccion.chunksFallidos },
      );
    }

    const estado: "extraido" | "parcial" =
      metaExtraccion.chunksFallidos.length === 0 ? "extraido" : "parcial";

    const tDb = Date.now();
    await conectarMongoose();
    logger.info({ ms: Date.now() - tDb }, "[5/5] mongo conectado");
    const doc = await Extraccion.create({
      usuarioId: session.user.id,
      banco: meta.data.banco ?? null,
      cuenta: resultado.cuenta,
      periodo: resultado.periodo,
      titular: resultado.titular,
      estado,
      movimientos: resultado.movimientos,
      archivo: {
        nombre: archivo.name,
        tamano: archivo.size,
        contentType: archivo.type,
        blobKey: blob.key,
        blobUrl: blob.url,
      },
      _meta: metaExtraccion,
    });

    logger.info(
      {
        extraccionId: String(doc._id),
        estado,
        movimientos: resultado.movimientos.length,
        tokens: metaExtraccion.tokensInput + metaExtraccion.tokensOutput,
        totalMs: Date.now() - t0,
      },
      "Extracción completada",
    );

    return NextResponse.json(
      {
        id: String(doc._id),
        estado,
        cuenta: resultado.cuenta,
        periodo: resultado.periodo,
        titular: resultado.titular,
        movimientos: resultado.movimientos,
        _meta: metaExtraccion,
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error({ err }, "Error en POST /api/extracciones");
    return respuestaError(err);
  }
}
