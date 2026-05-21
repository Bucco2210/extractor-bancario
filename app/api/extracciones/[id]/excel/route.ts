import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Extraccion } from "@/models/Extraccion";
import { exportarMovimientosExcel } from "@/lib/excel";
import { AppError, respuestaError } from "@/lib/errors";
import { descifrarExtraccionLean } from "@/lib/cifrado";

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
    const docRaw = await Extraccion.findOne({
      _id: id,
      usuarioId: session.user.id,
    }).lean();
    if (!docRaw) throw new AppError("NO_ENCONTRADO", "Extracción no encontrada.");
    const doc = descifrarExtraccionLean(docRaw);

    const xlsx = await exportarMovimientosExcel({
      banco: doc.banco,
      cuenta: doc.cuenta,
      periodo: doc.periodo,
      titular: doc.titular,
      movimientos: doc.movimientos.map((m) => ({
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia ?? null,
        debito: m.debito ?? null,
        credito: m.credito ?? null,
        saldo: m.saldo ?? null,
      })),
    });

    const nombre = `extraccion-${String(doc._id)}.xlsx`;
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return respuestaError(err);
  }
}
