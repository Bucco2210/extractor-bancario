import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Extraccion } from "@/models/Extraccion";
import { AppError, respuestaError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

    return NextResponse.json({
      id: String(doc._id),
      estado: doc.estado,
      banco: doc.banco,
      cuenta: doc.cuenta,
      periodo: doc.periodo,
      titular: doc.titular,
      error: doc.error,
      movimientos: doc.movimientos,
      _meta: {
        modelo: doc._meta.modelo,
        tokensInput: doc._meta.tokensInput,
        tokensOutput: doc._meta.tokensOutput,
        tiempoMs: doc._meta.tiempoMs,
        paginasTotal: doc._meta.paginasTotal ?? 0,
        chunksTotal: doc._meta.chunksTotal,
        chunksOk: doc._meta.chunksOk,
        chunksFallidos: doc._meta.chunksFallidos,
      },
    });
  } catch (err) {
    return respuestaError(err);
  }
}
