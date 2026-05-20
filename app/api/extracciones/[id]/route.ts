import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Extraccion } from "@/models/Extraccion";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import { AppError, respuestaError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  perfilId: z
    .string()
    .trim()
    .refine((v) => mongoose.isValidObjectId(v), {
      message: "perfilId no es un ObjectId válido",
    }),
});

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
      perfilId: doc.perfilId ? String(doc.perfilId) : null,
      banco: doc.banco,
      cuenta: doc.cuenta,
      periodo: doc.periodo,
      titular: doc.titular,
      error: doc.error,
      fuente: doc.fuente ?? "openai",
      huella: doc.huella ?? null,
      formatoAprendidoId: doc.formatoAprendidoId
        ? String(doc.formatoAprendidoId)
        : null,
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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new AppError("SIN_AUTH", "Debés iniciar sesión.");

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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();
    const perfil = await PerfilExtraccion.findById(parsed.data.perfilId)
      .select({ _id: 1, entidad: 1, activo: 1 })
      .lean();
    if (!perfil) throw new AppError("NO_ENCONTRADO", "Perfil no encontrado.");
    if (!perfil.activo) {
      throw new AppError("NO_PROCESABLE", "El perfil seleccionado está inactivo.");
    }

    const res = await Extraccion.updateOne(
      { _id: new Types.ObjectId(id), usuarioId: session.user.id },
      {
        $set: {
          perfilId: perfil._id,
          banco: perfil.entidad.nombre,
        },
      },
    );
    if (res.matchedCount === 0) {
      throw new AppError("NO_ENCONTRADO", "Extracción no encontrada.");
    }

    return NextResponse.json({
      id,
      perfilId: String(perfil._id),
      banco: perfil.entidad.nombre,
    });
  } catch (err) {
    return respuestaError(err);
  }
}
