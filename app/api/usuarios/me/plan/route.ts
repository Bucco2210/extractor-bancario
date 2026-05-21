import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { Usuario } from "@/models/Usuario";
import { PLANES } from "@/lib/planes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    await conectarMongoose();
    const u = await Usuario.findById(new Types.ObjectId(session.user.id))
      .select({ planInfo: 1, email: 1, nombre: 1, rol: 1 })
      .lean();
    if (!u) throw new AppError("NO_ENCONTRADO", "Usuario no encontrado.");

    const pi = u.planInfo;
    if (!pi) {
      return NextResponse.json({
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
        plan: null,
        mensaje:
          "Tu cuenta todavía no tiene un plan asignado. Pedile al administrador que te asigne uno.",
      });
    }

    const def = PLANES[pi.plan];
    return NextResponse.json({
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      plan: {
        id: pi.plan,
        nombre: def.nombre,
        cicloFacturacion: pi.cicloFacturacion,
        cicloInicio: pi.cicloInicio.toISOString(),
        cicloFin: pi.cicloFin.toISOString(),
        estadoCuenta: pi.estadoCuenta,
        usado: {
          extracciones: pi.extraccionesEnPeriodo,
          conciliaciones: pi.conciliacionesEnPeriodo,
        },
        limites: {
          extracciones: def.limiteExtraccionesPorCiclo,
          conciliaciones: def.limiteConciliacionesPorCiclo,
        },
      },
    });
  } catch (err) {
    return respuestaError(err);
  }
}
