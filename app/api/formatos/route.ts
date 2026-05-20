import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { FormatoAprendido } from "@/models/FormatoAprendido";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import { formatoListQuerySchema } from "@/lib/formatos-schema";
import { serializarFormato } from "@/lib/formatos-serializer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requerirSesion();
    const url = new URL(req.url);
    const parsed = formatoListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Query inválida.", {
        issues: parsed.error.flatten(),
      });
    }
    const q = parsed.data;
    await conectarMongoose();

    const filtroPerfil: Record<string, unknown> = {};
    if (q.entidad) filtroPerfil["entidad.slug"] = q.entidad;
    let perfilIdsPorEntidad: Types.ObjectId[] | null = null;
    if (q.entidad) {
      const perfiles = await PerfilExtraccion.find(filtroPerfil)
        .select({ _id: 1 })
        .lean();
      perfilIdsPorEntidad = perfiles.map((p) => p._id);
      if (perfilIdsPorEntidad.length === 0) {
        return NextResponse.json({ total: 0, items: [] });
      }
    }

    const filtro: Record<string, unknown> = {};
    if (q.perfilId) filtro.perfilId = new Types.ObjectId(q.perfilId);
    if (perfilIdsPorEntidad) {
      filtro.perfilId = filtro.perfilId
        ? filtro.perfilId
        : { $in: perfilIdsPorEntidad };
    }
    if (typeof q.reglaActiva === "boolean") filtro.reglaActiva = q.reglaActiva;
    if (typeof q.activo === "boolean") filtro.activo = q.activo;
    if (q.q) {
      const rx = new RegExp(escaparRegex(q.q), "i");
      filtro.$or = [{ huella: rx }, { resumenHuella: rx }, { notas: rx }];
    }

    const docs = await FormatoAprendido.find(filtro)
      .sort({ "stats.ultimoUso": -1, updatedAt: -1 })
      .limit(q.limite)
      .lean();

    return NextResponse.json({
      total: docs.length,
      items: docs.map((d) =>
        serializarFormato({
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

function escaparRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
