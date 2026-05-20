import { NextResponse } from "next/server";
import { z } from "zod";
import mongoose, { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { extraerTextoPdf, tieneTextoSuficiente } from "@/lib/pdf";
import { definirChunks } from "@/lib/openai";
import { getBlobStorage } from "@/lib/blob";
import { Extraccion } from "@/models/Extraccion";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import { FormatoAprendido } from "@/models/FormatoAprendido";
import { AppError, respuestaError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { correrExtraccion } from "@/lib/extraccion-runner";
import {
  detectarPerfil,
  type CandidatoPerfil,
  type Coincidencia,
} from "@/lib/detector-perfil";
import { calcularHuella } from "@/lib/huella";
import { aplicarRegla } from "@/lib/regla-determinista";
import {
  registrarExtraccionPorRegla,
  registrarFalloRegla,
} from "@/lib/aprendizaje";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UMBRAL_AUTO_DETECCION = 0.85;

const formSchema = z.object({
  banco: z.string().trim().optional(),
  perfilId: z
    .string()
    .trim()
    .refine((v) => !v || mongoose.isValidObjectId(v), {
      message: "perfilId no es un ObjectId válido",
    })
    .optional(),
});

type DeteccionResultado = {
  mejor: Coincidencia | null;
  candidatos: Coincidencia[];
  modelo: string;
  tokensInput: number;
  tokensOutput: number;
  tiempoMs: number;
};

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

    const meta = formSchema.safeParse({
      banco: formData.get("banco") ?? undefined,
      perfilId: formData.get("perfilId") ?? undefined,
    });
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
      "[1/5] archivo recibido",
    );

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

    const chunks = definirChunks(textoPdf.paginas, env.EXTRACCION_PAGINAS_POR_CHUNK);
    if (chunks.length === 0) {
      throw new AppError(
        "NO_PROCESABLE",
        "El PDF no produjo páginas con texto procesable.",
      );
    }

    await conectarMongoose();

    let perfilIdFinal: Types.ObjectId | null = null;
    let bancoFinal: string | null = meta.data.banco ?? null;
    let deteccion: DeteccionResultado | null = null;
    let deteccionAuto = false;

    if (meta.data.perfilId) {
      const p = await PerfilExtraccion.findById(meta.data.perfilId)
        .select({ _id: 1, entidad: 1, activo: 1 })
        .lean();
      if (!p) {
        throw new AppError("NO_ENCONTRADO", "Perfil no encontrado.");
      }
      if (!p.activo) {
        throw new AppError("NO_PROCESABLE", "El perfil seleccionado está inactivo.");
      }
      perfilIdFinal = p._id;
      bancoFinal = bancoFinal ?? p.entidad.nombre;
    } else if (!bancoFinal) {
      const tDet = Date.now();
      deteccion = await ejecutarDetector(textoPdf.textoCompleto);
      logger.info(
        {
          ms: Date.now() - tDet,
          mejorSlug: deteccion?.mejor?.slug ?? null,
          mejorScore: deteccion?.mejor?.score ?? null,
          umbral: UMBRAL_AUTO_DETECCION,
        },
        "[4/5] detector ejecutado",
      );
      if (
        deteccion?.mejor &&
        deteccion.mejor.score >= UMBRAL_AUTO_DETECCION &&
        mongoose.isValidObjectId(deteccion.mejor.perfilId)
      ) {
        perfilIdFinal = new Types.ObjectId(deteccion.mejor.perfilId);
        deteccionAuto = true;
        const p = await PerfilExtraccion.findById(perfilIdFinal)
          .select({ entidad: 1 })
          .lean();
        if (p) bancoFinal = p.entidad.nombre;
      }
    }

    const { huella, resumen: resumenHuella } = calcularHuella(
      textoPdf.textoCompleto,
      env.APRENDIZAJE_HUELLA_LINEAS,
    );

    // Si tenemos perfil y existe un FormatoAprendido con regla activa
    // para esta huella, intentamos extraer determinísticamente y
    // saltamos OpenAI.
    let reglaResultado: Awaited<ReturnType<typeof aplicarRegla>> | null = null;
    let formatoAplicado: { _id: import("mongoose").Types.ObjectId } | null = null;
    if (perfilIdFinal) {
      const formato = await FormatoAprendido.findOne({
        huella,
        reglaActiva: true,
        activo: true,
        reglaRegex: { $ne: null },
      })
        .select({ _id: 1, reglaRegex: 1, perfilId: 1 })
        .lean();
      if (formato?.reglaRegex) {
        const r = aplicarRegla(textoPdf.textoCompleto, formato.reglaRegex);
        reglaResultado = r;
        if (
          !r.errorCompilacion &&
          r.matchRate >= env.APRENDIZAJE_UMBRAL_MATCH_RATE &&
          r.movimientos.length > 0
        ) {
          formatoAplicado = { _id: formato._id };
        } else {
          await registrarFalloRegla(formato._id);
          logger.warn(
            {
              huella,
              formatoId: String(formato._id),
              matchRate: r.matchRate,
              umbral: env.APRENDIZAJE_UMBRAL_MATCH_RATE,
              error: r.errorCompilacion,
            },
            "regla determinística falló — cayendo a OpenAI",
          );
        }
      }
    }

    // === Camino 1: regla determinística ===
    if (formatoAplicado && reglaResultado) {
      const docRegla = await Extraccion.create({
        usuarioId: session.user.id,
        perfilId: perfilIdFinal,
        banco: bancoFinal,
        cuenta: null,
        periodo: null,
        titular: null,
        estado: "extraido",
        fuente: "regla",
        huella,
        formatoAprendidoId: formatoAplicado._id,
        movimientos: reglaResultado.movimientos,
        archivo: {
          nombre: archivo.name,
          tamano: archivo.size,
          contentType: archivo.type,
          blobKey: blob.key,
          blobUrl: blob.url,
        },
        _meta: {
          modelo: "regla_determinista",
          tokensInput: deteccion?.tokensInput ?? 0,
          tokensOutput: deteccion?.tokensOutput ?? 0,
          tiempoMs: Date.now() - t0,
          paginasTotal: textoPdf.totalPaginas,
          chunksTotal: 0,
          chunksOk: 0,
          chunksFallidos: [],
          chunksDefinicion: [],
          chunksCompletados: [],
        },
      });

      await registrarExtraccionPorRegla(formatoAplicado._id);

      logger.info(
        {
          extraccionId: String(docRegla._id),
          formatoId: String(formatoAplicado._id),
          matchRate: reglaResultado.matchRate,
          movimientos: reglaResultado.movimientos.length,
          totalMs: Date.now() - t0,
        },
        "extracción resuelta por regla determinística (sin OpenAI)",
      );

      return NextResponse.json(
        {
          id: String(docRegla._id),
          estado: "extraido" as const,
          fuente: "regla" as const,
          paginasTotal: textoPdf.totalPaginas,
          chunksTotal: 0,
          perfilId: perfilIdFinal ? String(perfilIdFinal) : null,
          deteccion: deteccion
            ? {
                mejor: deteccion.mejor,
                candidatos: deteccion.candidatos,
                umbral: UMBRAL_AUTO_DETECCION,
                auto: deteccionAuto,
              }
            : null,
          reglaAplicada: {
            formatoId: String(formatoAplicado._id),
            matchRate: reglaResultado.matchRate,
            movimientos: reglaResultado.movimientos.length,
          },
        },
        { status: 201 },
      );
    }

    // === Camino 2: pipeline OpenAI normal ===
    const doc = await Extraccion.create({
      usuarioId: session.user.id,
      perfilId: perfilIdFinal,
      banco: bancoFinal,
      cuenta: null,
      periodo: null,
      titular: null,
      estado: "procesando",
      fuente: "openai",
      huella,
      formatoAprendidoId: null,
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
        tokensInput: deteccion?.tokensInput ?? 0,
        tokensOutput: deteccion?.tokensOutput ?? 0,
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
        perfilId: perfilIdFinal ? String(perfilIdFinal) : null,
        perfilOrigen: meta.data.perfilId
          ? "usuario_eligio"
          : deteccionAuto
            ? "auto_detect"
            : "sin_perfil",
        paginas: textoPdf.totalPaginas,
        chunks: chunks.length,
        huella,
        msHastaResponse: Date.now() - t0,
      },
      "[5/5] doc creado, lanzando runner en background",
    );

    void correrExtraccion({
      extraccionId: String(doc._id),
      chunks,
      banco: bancoFinal,
      motivo: "inicial",
      huella,
      resumenHuella,
      perfilId: perfilIdFinal,
    });

    return NextResponse.json(
      {
        id: String(doc._id),
        estado: "procesando" as const,
        fuente: "openai" as const,
        paginasTotal: textoPdf.totalPaginas,
        chunksTotal: chunks.length,
        perfilId: perfilIdFinal ? String(perfilIdFinal) : null,
        deteccion: deteccion
          ? {
              mejor: deteccion.mejor,
              candidatos: deteccion.candidatos,
              umbral: UMBRAL_AUTO_DETECCION,
              auto: deteccionAuto,
            }
          : null,
        reglaAplicada: null,
      },
      { status: 202 },
    );
  } catch (err) {
    logger.error({ err }, "Error en POST /api/extracciones");
    return respuestaError(err);
  }
}

async function ejecutarDetector(
  textoCompleto: string,
): Promise<DeteccionResultado | null> {
  const docs = await PerfilExtraccion.find({ activo: true })
    .select({
      _id: 1,
      slug: 1,
      entidad: 1,
      nombre: 1,
      categoria: 1,
      tipoDocumento: 1,
      monedaPrimaria: 1,
      huella: 1,
    })
    .lean();
  if (docs.length === 0) return null;

  const candidatos: CandidatoPerfil[] = docs.map((d) => ({
    id: String(d._id),
    slug: d.slug,
    nombreEntidad: d.entidad.nombre,
    nombre: d.nombre,
    categoria: d.categoria,
    tipoDocumento: d.tipoDocumento,
    monedaPrimaria: d.monedaPrimaria,
    palabrasClave: d.huella?.palabrasClave ?? [],
  }));

  try {
    return await detectarPerfil({
      texto: textoCompleto,
      candidatos,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "detector falló — la extracción sigue sin perfilId",
    );
    return null;
  }
}
