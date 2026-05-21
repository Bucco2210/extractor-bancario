import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  parsearSignatureHeader,
  verificarFirmaWebhook,
  pagoDesdePayloadMP,
  type MercadoPagoPayment,
} from "../app/lib/mercado-pago";

describe("parsearSignatureHeader", () => {
  it("parsea ts y v1 del formato oficial", () => {
    const r = parsearSignatureHeader("ts=1700000000,v1=abc123");
    expect(r).toEqual({ ts: "1700000000", v1: "abc123" });
  });

  it("acepta orden cambiado y espacios", () => {
    const r = parsearSignatureHeader(" v1=hex , ts=1 ");
    expect(r).toEqual({ ts: "1", v1: "hex" });
  });

  it("devuelve null si falta v1", () => {
    expect(parsearSignatureHeader("ts=1")).toBeNull();
  });

  it("devuelve null si el header es vacío", () => {
    expect(parsearSignatureHeader(null)).toBeNull();
    expect(parsearSignatureHeader("")).toBeNull();
  });
});

describe("verificarFirmaWebhook", () => {
  const secret = "test-secret";
  const ts = "1700000000";
  const dataId = "12345";
  const requestId = "req-abc";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1Correcto = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  it("true cuando la firma calza con el HMAC", () => {
    const ok = verificarFirmaWebhook({
      secret,
      signature: { ts, v1: v1Correcto },
      requestId,
      dataId,
    });
    expect(ok).toBe(true);
  });

  it("false cuando la firma no calza", () => {
    const ok = verificarFirmaWebhook({
      secret,
      signature: { ts, v1: "0".repeat(64) },
      requestId,
      dataId,
    });
    expect(ok).toBe(false);
  });

  it("false con secret incorrecto", () => {
    const ok = verificarFirmaWebhook({
      secret: "otro",
      signature: { ts, v1: v1Correcto },
      requestId,
      dataId,
    });
    expect(ok).toBe(false);
  });

  it("false con v1 no-hex (largos distintos)", () => {
    const ok = verificarFirmaWebhook({
      secret,
      signature: { ts, v1: "nope" },
      requestId,
      dataId,
    });
    expect(ok).toBe(false);
  });
});

describe("pagoDesdePayloadMP", () => {
  const base: MercadoPagoPayment = {
    id: "PAY-1",
    status: "approved",
    transaction_amount: 49,
    currency_id: "USD",
    external_reference: "507f1f77bcf86cd799439011",
    metadata: { plan: "pro", cicloFacturacion: "mensual" },
  };

  it("normaliza un payment aprobado con plan/ciclo válidos", () => {
    const r = pagoDesdePayloadMP(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos).toEqual({
        usuarioId: "507f1f77bcf86cd799439011",
        plan: "pro",
        cicloFacturacion: "mensual",
        monto: 49,
        moneda: "USD",
        mpPaymentId: "PAY-1",
        estado: "confirmado",
      });
    }
  });

  it("mapea status pending → pendiente", () => {
    const r = pagoDesdePayloadMP({ ...base, status: "pending" });
    if (!r.ok) throw new Error("debería ser ok");
    expect(r.datos.estado).toBe("pendiente");
  });

  it("mapea status refunded → reembolsado", () => {
    const r = pagoDesdePayloadMP({ ...base, status: "refunded" });
    if (!r.ok) throw new Error("debería ser ok");
    expect(r.datos.estado).toBe("reembolsado");
  });

  it("rechaza si falta external_reference", () => {
    const r = pagoDesdePayloadMP({ ...base, external_reference: null });
    expect(r.ok).toBe(false);
  });

  it("rechaza si metadata.plan no existe", () => {
    const r = pagoDesdePayloadMP({
      ...base,
      metadata: { cicloFacturacion: "mensual" },
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza plan inválido", () => {
    const r = pagoDesdePayloadMP({
      ...base,
      metadata: { plan: "ultraPremium" as unknown as string },
    });
    expect(r.ok).toBe(false);
  });

  it("default cicloFacturacion=mensual cuando no viene", () => {
    const r = pagoDesdePayloadMP({
      ...base,
      metadata: { plan: "pro" },
    });
    if (!r.ok) throw new Error("debería ser ok");
    expect(r.datos.cicloFacturacion).toBe("mensual");
  });

  it("rechaza monto ≤ 0", () => {
    const r = pagoDesdePayloadMP({ ...base, transaction_amount: 0 });
    expect(r.ok).toBe(false);
  });
});
