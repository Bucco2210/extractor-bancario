import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { Extraccion } from "@/models/Extraccion";
import { Conciliacion } from "@/models/Conciliacion";
import { conciliacionListQuerySchema } from "@/lib/conciliaciones-schema";
import { serializarConciliacion } from "@/lib/conciliaciones-serializer";
import { parsearSegundaFuente } from "@/lib/conciliacion-parser";
import {
  aMovimientosExtracto,
  calcularEstadisticas,
  matchear,
} from "@/lib/conciliacion-matcheo";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TAMANO_MAX_MB = 10;
const MIMES_PERMITIDOS = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "",
]);

const mapeoOverrideSchema = z
  .object({
    fecha: z.string().trim().min(1).max(120),
    descripcion: z.string().trim().min(1).max(120),
    monto: z.string().trim().min(1).max(120),
    referencia: z.string().trim().min(1).max(120).optional(),
  })
  .partial({ referencia: true });

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    const url = new URL(req.url);
    const parsed = conciliacionListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Query inválida.", {
        issues: parsed.error.flatten(),
      });
    }
    const q = parsed.data;
    await conectarMongoose();
    const filtro: Record<string, unknown> = {
      usuarioId: new Types.ObjectId(session.user.id),
    };
    if (q.extraccionId) {
      filtro.extraccionId = new Types.ObjectId(q.extraccionId);
    }
    const docs = await Conciliacion.find(filtro)
      .sort({ createdAt: -1 })
      .limit(q.limite)
      .lean();
    return NextResponse.json({
      total: docs.length,
      items: docs.map((d) =>
        serializarConciliacion({
          ...d,
          createdAt: (d as { createdAt?: Date }).createdAt,
          updatedAt: (d as { updatedAt?: Date }).updatedAt,
        }),
      ),
    });
  } catch (err) {
    return respuestaError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    const env = getEnv();

    const fd = await req.formData();
    const archivo = fd.get("archivo");
    const extraccionIdRaw = String(fd.get("extraccionId") ?? "").trim();
    const nombre = String(fd.get("nombre") ?? "").trim();
    const mapeoOverrideRaw = fd.get("mapeoOverride");

    if (!(archivo instanceof File)) {
      throw new AppError("INPUT_INVALIDO", "Falta el archivo de la segunda fuente.");
    }
    if (!mongoose.isValidObjectId(extraccionIdRaw)) {
      throw new AppError("INPUT_INVALIDO", "extraccionId inválido.");
    }
    if (!nombre) {
      throw new AppError("INPUT_INVALIDO", "Hace falta un nombre para la conciliación.");
    }
    if (archivo.size > TAMANO_MAX_MB * 1024 * 1024) {
      throw new AppError(
        "INPUT_INVALIDO",
        `El archivo supera el límite de ${TAMANO_MAX_MB} MB.`,
      );
    }
    if (!MIMES_PERMITIDOS.has(archivo.type)) {
      throw new AppError(
        "INPUT_INVALIDO",
        `Tipo de archivo no soportado: ${archivo.type || "(desconocido)"}. Aceptamos CSV o XLSX.`,
      );
    }

    let mapeoOverride: ReturnType<typeof mapeoOverrideSchema.parse> | undefined;
    if (typeof mapeoOverrideRaw === "string" && mapeoOverrideRaw.trim()) {
      try {
        const parsed = mapeoOverrideSchema.safeParse(JSON.parse(mapeoOverrideRaw));
        if (!parsed.success) {
          throw new AppError("INPUT_INVALIDO", "mapeoOverride inválido.", {
            issues: parsed.error.flatten(),
          });
        }
        mapeoOverride = parsed.data;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("INPUT_INVALIDO", "mapeoOverride no es JSON válido.");
      }
    }

    await conectarMongoose();
    const extraccion = await Extraccion.findOne({
      _id: new Types.ObjectId(extraccionIdRaw),
      usuarioId: session.user.id,
    })
      .select({ _id: 1, movimientos: 1, banco: 1 })
      .lean();
    if (!extraccion) {
      throw new AppError("NO_ENCONTRADO", "Extracción no encontrada.");
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());
    const resultado = await parsearSegundaFuente({
      buffer,
      nombreArchivo: archivo.name,
      mapeoOverride: mapeoOverride
        ? {
            fecha: mapeoOverride.fecha,
            descripcion: mapeoOverride.descripcion,
            monto: mapeoOverride.monto,
            referencia: mapeoOverride.referencia ?? null,
          }
        : undefined,
    });

    if (!resultado.ok) {
      return NextResponse.json(
        {
          error: "MAPEO_INCOMPLETO",
          mensaje:
            "No pude identificar todas las columnas automáticamente. Mandá un `mapeoOverride` con los nombres exactos.",
          detalles: {
            headers: resultado.headers,
            camposFaltantes: resultado.camposFaltantes,
            filasSample: resultado.filas,
          },
        },
        { status: 422 },
      );
    }

    const tolerancias = {
      dias: env.CONCILIACION_TOLERANCIA_DIAS,
      importe: env.CONCILIACION_TOLERANCIA_IMPORTE_PESOS,
      fuzzyUmbral: env.CONCILIACION_FUZZY_UMBRAL,
    };

    const movimientosExtracto = aMovimientosExtracto(extraccion.movimientos ?? []);
    const r = matchear({
      movimientos: movimientosExtracto,
      registros: resultado.data.registros,
      tolerancias,
    });

    const estadisticas = calcularEstadisticas({
      totalExtracto: extraccion.movimientos?.length ?? 0,
      totalSegundaFuente: resultado.data.registros.length,
      matchesExtractoIdxs: r.matches.map((m) => m.extractoIdx),
      matchesRegistroIdxs: r.matches.map((m) => m.registroIdx),
      descartadosExtracto: [],
      gruposManuales: [],
    });

    const doc = await Conciliacion.create({
      usuarioId: session.user.id,
      extraccionId: extraccion._id,
      nombre,
      estado: "completada",
      segundaFuente: {
        archivoNombre: archivo.name,
        formato: resultado.data.formato,
        registros: resultado.data.registros,
        mapeoColumnas: resultado.data.mapeoColumnas,
        headersOriginales: resultado.data.headers,
      },
      tolerancias,
      matches: r.matches.map((m) => ({ ...m, confirmadoManualmente: false })),
      descartadosExtracto: [],
      gruposManuales: [],
      estadisticas,
      notas: "",
    });

    logger.info(
      {
        conciliacionId: String(doc._id),
        extraccionId: String(extraccion._id),
        registros: resultado.data.registros.length,
        matches: r.matches.length,
      },
      "conciliación creada",
    );

    return NextResponse.json(serializarConciliacion(doc.toObject()), {
      status: 201,
    });
  } catch (err) {
    logger.error({ err }, "Error en POST /api/conciliaciones");
    return respuestaError(err);
  }
}
