import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { extraerTextoPdf, tieneTextoSuficiente } from "@/lib/pdf";
import { definirChunks } from "@/lib/openai";
import { getBlobStorage } from "@/lib/blob";
import { Extraccion } from "@/models/Extraccion";
import { AppError, respuestaError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { correrExtraccion } from "@/lib/extraccion-runner";

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
    if (archivo.type !== "application/pdf") {
      throw new AppError(
        "NO_PROCESABLE",
        "Por ahora solo se procesan PDFs digitales en Fase 1.",
      );
    }

    const t0 = Date.now();
    const buffer = Buffer.from(await archivo.arrayBuffer());
    logger.info(
      { archivo: archivo.name, tamanoKB: Math.round(archivo.size / 1024) },
      "[1/4] archivo recibido",
    );

    const tPdf = Date.now();
    const textoPdf = await extraerTextoPdf(buffer);
    logger.info(
      {
        paginas: textoPdf.totalPaginas,
        chars: textoPdf.textoCompleto.length,
        ms: Date.now() - tPdf,
      },
      "[2/4] PDF parseado",
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
    logger.info({ ms: Date.now() - tBlob }, "[3/4] blob guardado");

    const chunks = definirChunks(textoPdf.paginas, env.EXTRACCION_PAGINAS_POR_CHUNK);
    if (chunks.length === 0) {
      throw new AppError(
        "NO_PROCESABLE",
        "El PDF no produjo páginas con texto procesable.",
      );
    }

    await conectarMongoose();
    const doc = await Extraccion.create({
      usuarioId: session.user.id,
      banco: meta.data.banco ?? null,
      cuenta: null,
      periodo: null,
      titular: null,
      estado: "procesando",
      movimientos: [],
      archivo: {
        nombre: archivo.name,
        tamano: archivo.size,
        contentType: archivo.type,
        blobKey: blob.key,
        blobUrl: blob.url,
      },
      _meta: {
        modelo: env.OPENAI_MODEL_DEFAULT,
        tokensInput: 0,
        tokensOutput: 0,
        tiempoMs: 0,
        paginasTotal: textoPdf.totalPaginas,
        chunksTotal: chunks.length,
        chunksOk: 0,
        chunksFallidos: [],
        chunksDefinicion: chunks.map((c) => ({
          indice: c.indice,
          paginas: c.paginas.map((p) => p.numero),
        })),
        chunksCompletados: [],
      },
    });

    logger.info(
      {
        extraccionId: String(doc._id),
        paginas: textoPdf.totalPaginas,
        chunks: chunks.length,
        msHastaResponse: Date.now() - t0,
      },
      "[4/4] doc creado, lanzando runner en background",
    );

    void correrExtraccion({
      extraccionId: String(doc._id),
      chunks,
      banco: meta.data.banco ?? null,
      motivo: "inicial",
    });

    return NextResponse.json(
      {
        id: String(doc._id),
        estado: "procesando" as const,
        paginasTotal: textoPdf.totalPaginas,
        chunksTotal: chunks.length,
      },
      { status: 202 },
    );
  } catch (err) {
    logger.error({ err }, "Error en POST /api/extracciones");
    return respuestaError(err);
  }
}
