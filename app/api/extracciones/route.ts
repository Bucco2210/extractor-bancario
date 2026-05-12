import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { extraerTextoPdf, tieneTextoSuficiente } from "@/lib/pdf";
import { extraerMovimientos } from "@/lib/openai";
import { getBlobStorage } from "@/lib/blob";
import { Extraccion } from "@/models/Extraccion";
import { AppError, respuestaError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const buffer = Buffer.from(await archivo.arrayBuffer());

    if (archivo.type !== "application/pdf") {
      throw new AppError(
        "NO_PROCESABLE",
        "Por ahora solo se procesan PDFs digitales en Fase 1.",
      );
    }

    const textoPdf = await extraerTextoPdf(buffer);
    if (!tieneTextoSuficiente(textoPdf)) {
      throw new AppError(
        "NO_PROCESABLE",
        "El PDF no tiene texto extraíble (posiblemente escaneado). OCR llega en fase posterior.",
      );
    }

    const blob = await getBlobStorage().subir({
      nombre: archivo.name,
      contentType: archivo.type,
      data: buffer,
    });

    const { resultado, meta: metaExtraccion } = await extraerMovimientos({
      textoExtracto: textoPdf.textoCompleto,
      banco: meta.data.banco,
    });

    await conectarMongoose();
    const doc = await Extraccion.create({
      usuarioId: session.user.id,
      banco: meta.data.banco ?? null,
      cuenta: resultado.cuenta,
      periodo: resultado.periodo,
      titular: resultado.titular,
      estado: "extraido",
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
        movimientos: resultado.movimientos.length,
        tokens: metaExtraccion.tokensInput + metaExtraccion.tokensOutput,
        tiempoMs: metaExtraccion.tiempoMs,
      },
      "Extracción completada",
    );

    return NextResponse.json(
      {
        id: String(doc._id),
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
