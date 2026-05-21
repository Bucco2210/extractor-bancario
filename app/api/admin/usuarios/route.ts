import { NextResponse } from "next/server";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol } from "@/lib/permisos";
import { Usuario } from "@/models/Usuario";
import { adminUsuariosListQuerySchema } from "@/lib/admin-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requerirRol("admin");
    const url = new URL(req.url);
    const parsed = adminUsuariosListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Query inválida.", {
        issues: parsed.error.flatten(),
      });
    }
    const q = parsed.data;

    await conectarMongoose();

    const filtro: Record<string, unknown> = {};
    if (q.q) {
      const rx = new RegExp(escaparRegex(q.q), "i");
      filtro.$or = [{ email: rx }, { nombre: rx }];
    }
    if (q.plan) filtro["planInfo.plan"] = q.plan;
    if (q.estadoCuenta) filtro["planInfo.estadoCuenta"] = q.estadoCuenta;

    const docs = await Usuario.find(filtro)
      .select({
        email: 1,
        nombre: 1,
        rol: 1,
        activo: 1,
        planInfo: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1 })
      .limit(q.limite)
      .lean();

    return NextResponse.json({
      total: docs.length,
      items: docs.map((d) => ({
        id: String(d._id),
        email: d.email,
        nombre: d.nombre,
        rol: d.rol,
        activo: d.activo,
        plan: d.planInfo?.plan ?? null,
        cicloFacturacion: d.planInfo?.cicloFacturacion ?? null,
        cicloInicio: d.planInfo?.cicloInicio?.toISOString() ?? null,
        cicloFin: d.planInfo?.cicloFin?.toISOString() ?? null,
        extraccionesEnPeriodo: d.planInfo?.extraccionesEnPeriodo ?? 0,
        conciliacionesEnPeriodo: d.planInfo?.conciliacionesEnPeriodo ?? 0,
        estadoCuenta: d.planInfo?.estadoCuenta ?? null,
        createdAt: (d as { createdAt?: Date }).createdAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return respuestaError(err);
  }
}
