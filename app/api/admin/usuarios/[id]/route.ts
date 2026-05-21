import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol } from "@/lib/permisos";
import { Usuario } from "@/models/Usuario";
import { patchUsuarioSchema } from "@/lib/admin-schemas";
import { calcularFinCiclo } from "@/lib/planes";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await requerirRol("admin");
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
    const parsed = patchUsuarioSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();

    const doc = await Usuario.findById(new Types.ObjectId(id));
    if (!doc) throw new AppError("NO_ENCONTRADO", "Usuario no encontrado.");

    if (parsed.data.rol) doc.rol = parsed.data.rol;
    if (typeof parsed.data.activo === "boolean") doc.activo = parsed.data.activo;

    // Si cambian plan/ciclo/estado, ajustar planInfo. Si planInfo no
    // existe (usuario viejo), lo bootstrapeo.
    const necesitaPlanInfo =
      parsed.data.plan ||
      parsed.data.cicloFacturacion ||
      parsed.data.estadoCuenta ||
      parsed.data.resetCiclo;

    if (necesitaPlanInfo) {
      const actual = doc.planInfo ?? {
        plan: "trial" as const,
        cicloFacturacion: "mensual" as const,
        cicloInicio: new Date(),
        cicloFin: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        extraccionesEnPeriodo: 0,
        conciliacionesEnPeriodo: 0,
        estadoCuenta: "activa" as const,
        invitadoPor: null,
      };

      const planNuevo = parsed.data.plan ?? actual.plan;
      const cicloNuevo = parsed.data.cicloFacturacion ?? actual.cicloFacturacion;
      const cambioDePlan =
        parsed.data.plan !== undefined && parsed.data.plan !== actual.plan;
      const cambioDeCiclo =
        parsed.data.cicloFacturacion !== undefined &&
        parsed.data.cicloFacturacion !== actual.cicloFacturacion;

      // Si cambia plan o ciclo, abrimos una ventana nueva.
      let inicio = actual.cicloInicio;
      let fin = actual.cicloFin;
      let extrac = actual.extraccionesEnPeriodo;
      let conc = actual.conciliacionesEnPeriodo;
      if (cambioDePlan || cambioDeCiclo || parsed.data.resetCiclo) {
        inicio = new Date();
        fin = calcularFinCiclo(planNuevo, cicloNuevo, inicio);
        extrac = 0;
        conc = 0;
      }

      doc.planInfo = {
        plan: planNuevo,
        cicloFacturacion: cicloNuevo,
        cicloInicio: inicio,
        cicloFin: fin,
        extraccionesEnPeriodo: extrac,
        conciliacionesEnPeriodo: conc,
        estadoCuenta: parsed.data.estadoCuenta ?? actual.estadoCuenta,
        invitadoPor: actual.invitadoPor,
      };
    }

    await doc.save();

    logger.info(
      { usuarioId: id, cambios: Object.keys(parsed.data) },
      "[admin] usuario actualizado",
    );

    return NextResponse.json({
      id: String(doc._id),
      email: doc.email,
      rol: doc.rol,
      activo: doc.activo,
      planInfo: doc.planInfo,
    });
  } catch (err) {
    return respuestaError(err);
  }
}
