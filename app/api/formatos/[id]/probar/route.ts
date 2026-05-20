import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { FormatoAprendido } from "@/models/FormatoAprendido";
import { formatoProbarBodySchema } from "@/lib/formatos-schema";
import { aplicarRegla } from "@/lib/regla-determinista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MUESTRA = 8;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requerirSesion();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("INPUT_INVALIDO", "ID inválido.");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = formatoProbarBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();
    const doc = await FormatoAprendido.findById(id)
      .select({ reglaRegex: 1 })
      .lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Formato no encontrado.");

    const regla = parsed.data.reglaRegex ?? doc.reglaRegex;
    if (!regla) {
      throw new AppError(
        "INPUT_INVALIDO",
        "El formato no tiene regla guardada y no mandaste reglaRegex en el body.",
      );
    }

    const resultado = aplicarRegla(parsed.data.texto, regla);
    return NextResponse.json({
      lineasTotal: resultado.lineasTotal,
      lineasPlausibles: resultado.lineasPlausibles,
      lineasMatcheadas: resultado.lineasMatcheadas,
      matchRate: resultado.matchRate,
      errorCompilacion: resultado.errorCompilacion,
      muestra: resultado.movimientos.slice(0, MAX_MUESTRA),
      totalMovimientos: resultado.movimientos.length,
    });
  } catch (err) {
    return respuestaError(err);
  }
}
