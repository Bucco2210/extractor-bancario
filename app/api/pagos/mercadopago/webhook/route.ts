import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { env } from "@/lib/env";
import { Usuario } from "@/models/Usuario";
import { Pago } from "@/models/Pago";
import { calcularFinCiclo } from "@/lib/planes";
import { logger } from "@/lib/logger";
import {
  parsearSignatureHeader,
  verificarFirmaWebhook,
  pagoDesdePayloadMP,
  type PayloadWebhookMP,
  type MercadoPagoPayment,
} from "@/lib/mercado-pago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MP_API = "https://api.mercadopago.com";

/**
 * Webhook de Mercado Pago. Detrás de `MERCADO_PAGO_HABILITADO`: si la
 * flag está apagada, responde 503 sin tocar nada — así no hay que
 * desplegar nuevo código para activar el feature.
 *
 * Cuando está activa, el flujo es:
 *   1. parsea x-signature y x-request-id
 *   2. valida HMAC contra MERCADO_PAGO_WEBHOOK_SECRET
 *   3. fetchea GET /v1/payments/{id} con MERCADO_PAGO_ACCESS_TOKEN
 *   4. normaliza con pagoDesdePayloadMP()
 *   5. idempotencia: si ya existe Pago con ese mpPaymentId, no duplica
 *   6. crea Pago + extiende ciclo del usuario (mismo flujo que admin/pagos)
 *
 * MP reintenta el webhook si no respondemos 2xx; por eso devolvemos
 * 2xx incluso para casos "no procesables" (payment irrelevante o usuario
 * inexistente) para que MP no siga golpeando. Errores reales de servidor
 * sí devuelven 5xx para forzar reintento.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!env.MERCADO_PAGO_HABILITADO) {
    return NextResponse.json(
      { mensaje: "Mercado Pago deshabilitado." },
      { status: 503 },
    );
  }

  const secret = env.MERCADO_PAGO_WEBHOOK_SECRET;
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!secret || !accessToken) {
    logger.error(
      {},
      "[mp-webhook] flag habilitada pero faltan credenciales (secret/token)",
    );
    return NextResponse.json(
      { mensaje: "Integración mal configurada." },
      { status: 500 },
    );
  }

  const signature = parsearSignatureHeader(req.headers.get("x-signature"));
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!signature || !requestId) {
    return NextResponse.json(
      { mensaje: "Headers de firma ausentes." },
      { status: 400 },
    );
  }

  let body: PayloadWebhookMP;
  try {
    body = (await req.json()) as PayloadWebhookMP;
  } catch {
    return NextResponse.json(
      { mensaje: "Body JSON inválido." },
      { status: 400 },
    );
  }

  const dataId = body?.data?.id;
  if (!dataId || body.type !== "payment") {
    // Otros tipos (merchant_order, etc.) los ignoramos en silencio.
    return NextResponse.json({ ignorado: true }, { status: 200 });
  }

  const firmaOk = verificarFirmaWebhook({
    secret,
    signature,
    requestId,
    dataId,
  });
  if (!firmaOk) {
    logger.warn({ dataId, requestId }, "[mp-webhook] firma inválida");
    return NextResponse.json(
      { mensaje: "Firma inválida." },
      { status: 401 },
    );
  }

  let payment: MercadoPagoPayment;
  try {
    const res = await fetch(`${MP_API}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      logger.error(
        { dataId, status: res.status },
        "[mp-webhook] fetch del payment falló",
      );
      return NextResponse.json(
        { mensaje: "No pudimos leer el payment." },
        { status: 502 },
      );
    }
    payment = (await res.json()) as MercadoPagoPayment;
  } catch (err) {
    logger.error(
      { dataId, err: String(err) },
      "[mp-webhook] error de red leyendo payment",
    );
    return NextResponse.json({ mensaje: "Error de red." }, { status: 502 });
  }

  const normalizado = pagoDesdePayloadMP(payment);
  if (!normalizado.ok) {
    logger.warn(
      { dataId, motivo: normalizado.motivo },
      "[mp-webhook] payment no procesable",
    );
    // 200 con flag de descarte para que MP no reintente eternamente.
    return NextResponse.json(
      { ignorado: true, motivo: normalizado.motivo },
      { status: 200 },
    );
  }
  const datos = normalizado.datos;

  await conectarMongoose();

  // Idempotencia: si ya procesamos este mpPaymentId, devolvemos 200 igual.
  const yaExiste = await Pago.findOne({
    fuente: "mercadopago",
    mpPaymentId: datos.mpPaymentId,
  })
    .select({ _id: 1, estado: 1 })
    .lean();
  if (yaExiste) {
    return NextResponse.json(
      { duplicado: true, pagoId: String(yaExiste._id) },
      { status: 200 },
    );
  }

  let usuarioObjectId: Types.ObjectId;
  try {
    usuarioObjectId = new Types.ObjectId(datos.usuarioId);
  } catch {
    return NextResponse.json(
      { ignorado: true, motivo: "usuarioId con formato inválido." },
      { status: 200 },
    );
  }

  const usuario = await Usuario.findById(usuarioObjectId);
  if (!usuario) {
    return NextResponse.json(
      { ignorado: true, motivo: "Usuario no encontrado." },
      { status: 200 },
    );
  }

  // Solo extendemos ventana si el pago está confirmado. Pagos pendientes
  // o rechazados se registran igual (para auditoría) pero no tocan el plan.
  if (datos.estado === "confirmado") {
    const ahora = new Date();
    const ventanaActualValida =
      usuario.planInfo &&
      usuario.planInfo.estadoCuenta === "activa" &&
      usuario.planInfo.cicloFin.getTime() > ahora.getTime() &&
      usuario.planInfo.plan === datos.plan;

    const inicio = ventanaActualValida ? usuario.planInfo!.cicloInicio : ahora;
    const baseFin = ventanaActualValida ? usuario.planInfo!.cicloFin : ahora;
    const fin = calcularFinCiclo(datos.plan, datos.cicloFacturacion, baseFin);

    usuario.planInfo = {
      plan: datos.plan,
      cicloFacturacion: datos.cicloFacturacion,
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
  }

  const periodoInicio = usuario.planInfo?.cicloInicio ?? new Date();
  const periodoFin = usuario.planInfo?.cicloFin ?? new Date();

  const pago = await Pago.create({
    usuarioId: usuario._id,
    plan: datos.plan,
    cicloFacturacion: datos.cicloFacturacion,
    monto: datos.monto,
    moneda: datos.moneda,
    periodoInicio,
    periodoFin,
    estado: datos.estado,
    fuente: "mercadopago",
    mpPaymentId: datos.mpPaymentId,
    notas: "",
    registradoPor: null,
    fechaConfirmacion: datos.estado === "confirmado" ? new Date() : null,
  });

  logger.info(
    {
      pagoId: String(pago._id),
      usuarioId: String(usuario._id),
      mpPaymentId: datos.mpPaymentId,
      estado: datos.estado,
      monto: datos.monto,
      moneda: datos.moneda,
    },
    "[mp-webhook] pago procesado",
  );

  return NextResponse.json(
    { pagoId: String(pago._id), estado: datos.estado },
    { status: 200 },
  );
}
