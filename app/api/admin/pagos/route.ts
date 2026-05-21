import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol } from "@/lib/permisos";
import { Pago } from "@/models/Pago";
import { Usuario } from "@/models/Usuario";
import { crearPagoSchema } from "@/lib/admin-schemas";
import { calcularFinCiclo } from "@/lib/planes";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registra un pago manual y abre una ventana fresca del plan pagado.
 * - Si el plan actual ya está activo y vencía después, extiende sumando
 *   la duración (no resetea hoy, ahorra "días gratis" al usuario).
 * - Si el plan actual está vencido o cambia, abre nueva ventana desde hoy.
 *
 * Para MP (futuro), el webhook usará un endpoint similar pero con
 * fuente="mercadopago" + mpPaymentId y skip de auth.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await requerirRol("admin");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = crearPagoSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }
    const data = parsed.data;

    await conectarMongoose();

    const usuario = await Usuario.findById(new Types.ObjectId(data.usuarioId));
    if (!usuario) throw new AppError("NO_ENCONTRADO", "Usuario no encontrado.");

    const ahora = new Date();
    const planActual = usuario.planInfo?.plan;
    const ventanaActualValida =
      usuario.planInfo &&
      usuario.planInfo.estadoCuenta === "activa" &&
      usuario.planInfo.cicloFin.getTime() > ahora.getTime() &&
      planActual === data.plan;

    const inicio = ventanaActualValida
      ? usuario.planInfo!.cicloInicio
      : ahora;
    const baseFin = ventanaActualValida
      ? usuario.planInfo!.cicloFin
      : ahora;
    const fin = calcularFinCiclo(data.plan, data.cicloFacturacion, baseFin);

    usuario.planInfo = {
      plan: data.plan,
      cicloFacturacion: data.cicloFacturacion,
      cicloInicio: inicio,
      cicloFin: fin,
      extraccionesEnPeriodo: ventanaActualValida
        ? usuario.planInfo!.extraccionesEnPeriodo
        : 0,
      conciliacionesEnPeriodo: ventanaActualValida
        ? usuario.planInfo!.conciliacionesEnPeriodo
        : 0,
      estadoCuenta: "activa",
      invitadoPor: usuario.planInfo?.invitadoPor ?? null,
    };
    await usuario.save();

    const pago = await Pago.create({
      usuarioId: usuario._id,
      plan: data.plan,
      cicloFacturacion: data.cicloFacturacion,
      monto: data.monto,
      moneda: data.moneda,
      periodoInicio: inicio,
      periodoFin: fin,
      estado: "confirmado",
      fuente: "manual",
      mpPaymentId: null,
      notas: data.notas,
      registradoPor: new Types.ObjectId(session.user.id),
      fechaConfirmacion: ahora,
    });

    logger.info(
      {
        pagoId: String(pago._id),
        usuarioId: String(usuario._id),
        plan: data.plan,
        monto: data.monto,
        moneda: data.moneda,
      },
      "[admin] pago manual registrado",
    );

    return NextResponse.json(
      {
        id: String(pago._id),
        usuarioId: String(usuario._id),
        plan: data.plan,
        cicloFacturacion: data.cicloFacturacion,
        monto: data.monto,
        moneda: data.moneda,
        periodoInicio: inicio.toISOString(),
        periodoFin: fin.toISOString(),
        cuentaActualizada: {
          plan: usuario.planInfo!.plan,
          cicloFin: usuario.planInfo!.cicloFin.toISOString(),
          estadoCuenta: usuario.planInfo!.estadoCuenta,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return respuestaError(err);
  }
}

/** Lista de pagos registrados (paginado simple). */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requerirRol("admin");
    const url = new URL(req.url);
    const limite = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limite") ?? "50")),
    );

    await conectarMongoose();
    const docs = await Pago.find({})
      .sort({ createdAt: -1 })
      .limit(limite)
      .lean();

    return NextResponse.json({
      total: docs.length,
      items: docs.map((d) => ({
        id: String(d._id),
        usuarioId: String(d.usuarioId),
        plan: d.plan,
        cicloFacturacion: d.cicloFacturacion,
        monto: d.monto,
        moneda: d.moneda,
        periodoInicio: d.periodoInicio.toISOString(),
        periodoFin: d.periodoFin.toISOString(),
        estado: d.estado,
        fuente: d.fuente,
        mpPaymentId: d.mpPaymentId ?? null,
        notas: d.notas ?? "",
        createdAt: (d as { createdAt?: Date }).createdAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return respuestaError(err);
  }
}
