import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Helpers para integrar Mercado Pago como pasarela de pagos.
 *
 * Todo este módulo es puro (sin acceso a DB ni a env directo): recibe
 * lo que necesita y devuelve resultados estructurados. El route handler
 * de `/api/pagos/mercadopago/webhook` lee la flag `MERCADO_PAGO_HABILITADO`
 * y, si está activa, valida la firma con `verificarFirmaWebhook` y arma
 * el `Pago` con `pagoDesdePayloadMP`.
 *
 * Convención para asociar el pago con el usuario: el front, al crear la
 * preference de MP, manda `external_reference` = `usuarioId` y
 * `metadata = { plan, cicloFacturacion }`. El webhook lee esos campos
 * para resolver a qué usuario y plan corresponde el pago.
 */

import type { CicloFacturacion, TipoPlan } from "@/lib/planes";
import { planExiste, CICLOS_FACTURACION } from "@/lib/planes";

/** Header `x-signature` que Mercado Pago manda con cada webhook. */
export type SignatureHeader = {
  ts: string;
  v1: string;
};

/**
 * Parsea el header `x-signature` de Mercado Pago. El formato es:
 *   `ts=1700000000,v1=<hex>`
 * Devuelve null si no tiene la forma esperada.
 */
export function parsearSignatureHeader(
  header: string | null,
): SignatureHeader | null {
  if (!header) return null;
  const partes = header.split(",").map((p) => p.trim());
  const map = new Map<string, string>();
  for (const p of partes) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    map.set(p.slice(0, idx), p.slice(idx + 1));
  }
  const ts = map.get("ts");
  const v1 = map.get("v1");
  if (!ts || !v1) return null;
  return { ts, v1 };
}

/**
 * Verifica la firma del webhook según el manifest oficial:
 *   manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
 *   esperado = HMAC-SHA256(secret, manifest) hex
 *
 * `dataId` se toma del body.data.id; `requestId` del header `x-request-id`.
 * Devuelve true solo si la firma coincide byte a byte (`timingSafeEqual`).
 */
export function verificarFirmaWebhook(input: {
  secret: string;
  signature: SignatureHeader;
  requestId: string;
  dataId: string;
}): boolean {
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.signature.ts};`;
  const esperadoHex = createHmac("sha256", input.secret)
    .update(manifest)
    .digest("hex");
  const a = Buffer.from(esperadoHex, "hex");
  const b = Buffer.from(input.signature.v1, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/**
 * Forma mínima del payload de webhook que el handler necesita procesar.
 * MP manda más campos; estos son los que usamos.
 */
export type PayloadWebhookMP = {
  /** `payment` | `merchant_order` | etc. Solo procesamos `payment`. */
  type: string;
  /** `created` | `updated`. */
  action?: string;
  data: { id: string };
};

/**
 * Forma de un Payment de la API de Mercado Pago (subset que consumimos).
 * El handler llama a GET /v1/payments/{id} y narrowing acá.
 */
export type MercadoPagoPayment = {
  id: string | number;
  status: string; // approved | pending | rejected | refunded
  status_detail?: string;
  transaction_amount: number;
  currency_id: string; // USD | ARS | ...
  external_reference?: string | null;
  metadata?: {
    plan?: string;
    cicloFacturacion?: string;
  } | null;
};

export type DatosPagoNormalizados = {
  usuarioId: string;
  plan: TipoPlan;
  cicloFacturacion: CicloFacturacion;
  monto: number;
  moneda: string;
  mpPaymentId: string;
  estado: "confirmado" | "pendiente" | "rechazado" | "reembolsado";
};

/**
 * Traduce un Payment de MP al shape interno (`Pago` model). Devuelve
 * `{ ok: false, motivo }` si el payment no tiene los datos mínimos
 * (external_reference + metadata.plan + cicloFacturacion válidos), así
 * el route handler puede responder 422 sin escribir nada.
 */
export function pagoDesdePayloadMP(
  payment: MercadoPagoPayment,
):
  | { ok: true; datos: DatosPagoNormalizados }
  | { ok: false; motivo: string } {
  if (!payment.external_reference) {
    return { ok: false, motivo: "Falta external_reference (usuarioId)." };
  }
  const plan = payment.metadata?.plan;
  if (!plan || !planExiste(plan)) {
    return { ok: false, motivo: "metadata.plan ausente o inválido." };
  }
  const ciclo = payment.metadata?.cicloFacturacion ?? "mensual";
  if (!(CICLOS_FACTURACION as readonly string[]).includes(ciclo)) {
    return { ok: false, motivo: "metadata.cicloFacturacion inválido." };
  }
  if (!(payment.transaction_amount > 0)) {
    return { ok: false, motivo: "transaction_amount inválido." };
  }
  const estadoMap: Record<string, DatosPagoNormalizados["estado"]> = {
    approved: "confirmado",
    pending: "pendiente",
    in_process: "pendiente",
    rejected: "rechazado",
    cancelled: "rechazado",
    refunded: "reembolsado",
    charged_back: "reembolsado",
  };
  const estado = estadoMap[payment.status] ?? "pendiente";

  return {
    ok: true,
    datos: {
      usuarioId: payment.external_reference,
      plan,
      cicloFacturacion: ciclo as CicloFacturacion,
      monto: payment.transaction_amount,
      moneda: payment.currency_id,
      mpPaymentId: String(payment.id),
      estado,
    },
  };
}
