import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();
const MP_SECRET = "mp-secret-test";
const MP_TOKEN = "mp-token-test";

const { envMock, pagoCreate, pagoFindOne, usuarioFindById, fetchMock } =
  vi.hoisted(() => ({
    envMock: {
      MERCADO_PAGO_HABILITADO: true,
      MERCADO_PAGO_WEBHOOK_SECRET: "mp-secret-test",
      MERCADO_PAGO_ACCESS_TOKEN: "mp-token-test",
    },
    pagoCreate: vi.fn(),
    pagoFindOne: vi.fn(),
    usuarioFindById: vi.fn(),
    fetchMock: vi.fn(),
  }));

vi.mock("../app/lib/env", () => ({ env: envMock }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../app/models/Pago", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/models/Pago")>();
  return {
    ...actual,
    Pago: {
      create: (data: unknown) => pagoCreate(data),
      findOne: (q: unknown) => ({
        select: () => ({ lean: () => pagoFindOne(q) }),
      }),
    },
  };
});

vi.mock("../app/models/Usuario", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/models/Usuario")>();
  return {
    ...actual,
    Usuario: {
      findById: (id: unknown) => usuarioFindById(id),
    },
  };
});

import { POST as postWebhook } from "../app/api/pagos/mercadopago/webhook/route";

function armarRequest(input: {
  body: unknown;
  v1?: string;
  ts?: string;
  requestId?: string;
}): Request {
  const ts = input.ts ?? "1700000000";
  const dataId =
    (input.body as { data?: { id?: string } })?.data?.id ?? "12345";
  const requestId = input.requestId ?? "req-1";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1Auto = createHmac("sha256", MP_SECRET).update(manifest).digest("hex");
  const v1 = input.v1 ?? v1Auto;
  return new Request("http://x", {
    method: "POST",
    headers: {
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
      "content-type": "application/json",
    },
    body: JSON.stringify(input.body),
  });
}

beforeEach(() => {
  envMock.MERCADO_PAGO_HABILITADO = true;
  envMock.MERCADO_PAGO_WEBHOOK_SECRET = MP_SECRET;
  envMock.MERCADO_PAGO_ACCESS_TOKEN = MP_TOKEN;
  pagoCreate.mockReset();
  pagoFindOne.mockReset();
  usuarioFindById.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/pagos/mercadopago/webhook — flag y headers", () => {
  it("503 si la flag está apagada", async () => {
    envMock.MERCADO_PAGO_HABILITADO = false;
    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "1" } } }),
    );
    expect(res.status).toBe(503);
    expect(pagoCreate).not.toHaveBeenCalled();
  });

  it("500 si faltan credenciales", async () => {
    envMock.MERCADO_PAGO_WEBHOOK_SECRET = "";
    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "1" } } }),
    );
    expect(res.status).toBe(500);
  });

  it("400 si faltan headers de firma", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "1" } }),
    });
    const res = await postWebhook(req);
    expect(res.status).toBe(400);
  });

  it("400 si el body no es JSON", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: {
        "x-signature": "ts=1,v1=abc",
        "x-request-id": "r",
      },
      body: "no-json",
    });
    const res = await postWebhook(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/pagos/mercadopago/webhook — payload y firma", () => {
  it("200 'ignorado' si type != 'payment'", async () => {
    const res = await postWebhook(
      armarRequest({ body: { type: "merchant_order", data: { id: "1" } } }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 si la firma no calza", async () => {
    const res = await postWebhook(
      armarRequest({
        body: { type: "payment", data: { id: "1" } },
        v1: "0".repeat(64),
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502 si el fetch al payment falla", async () => {
    fetchMock.mockResolvedValue(
      new Response("nope", { status: 503 }) as unknown as Response,
    );
    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "999" } } }),
    );
    expect(res.status).toBe(502);
  });
});

describe("POST /api/pagos/mercadopago/webhook — flujo feliz", () => {
  function payment(overrides: Partial<Record<string, unknown>> = {}): unknown {
    return {
      id: "PAY-1",
      status: "approved",
      transaction_amount: 49,
      currency_id: "USD",
      external_reference: USUARIO_ID,
      metadata: { plan: "pro", cicloFacturacion: "mensual" },
      ...overrides,
    };
  }

  it("registra el pago + extiende el ciclo cuando está confirmado", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payment()), { status: 200 }) as Response,
    );
    pagoFindOne.mockResolvedValue(null);
    const saveSpy = vi.fn(async () => undefined);
    usuarioFindById.mockResolvedValue({
      _id: new Types.ObjectId(USUARIO_ID),
      planInfo: undefined,
      save: saveSpy,
    });
    pagoCreate.mockResolvedValue({ _id: new Types.ObjectId() });

    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "PAY-1" } } }),
    );
    expect(res.status).toBe(200);
    expect(saveSpy).toHaveBeenCalled();
    expect(pagoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fuente: "mercadopago",
        mpPaymentId: "PAY-1",
        estado: "confirmado",
        plan: "pro",
      }),
    );
  });

  it("idempotente: si mpPaymentId ya existe, devuelve 200 sin crear pago", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payment()), { status: 200 }) as Response,
    );
    pagoFindOne.mockResolvedValue({ _id: new Types.ObjectId() });

    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "PAY-1" } } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicado).toBe(true);
    expect(pagoCreate).not.toHaveBeenCalled();
    expect(usuarioFindById).not.toHaveBeenCalled();
  });

  it("payment pendiente: registra pero NO extiende ciclo", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payment({ status: "pending" })), {
        status: 200,
      }) as Response,
    );
    pagoFindOne.mockResolvedValue(null);
    const saveSpy = vi.fn(async () => undefined);
    usuarioFindById.mockResolvedValue({
      _id: new Types.ObjectId(USUARIO_ID),
      planInfo: undefined,
      save: saveSpy,
    });
    pagoCreate.mockResolvedValue({ _id: new Types.ObjectId() });

    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "PAY-1" } } }),
    );
    expect(res.status).toBe(200);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(pagoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "pendiente" }),
    );
  });

  it("usuario inexistente: 200 ignorado, no crea pago", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payment()), { status: 200 }) as Response,
    );
    pagoFindOne.mockResolvedValue(null);
    usuarioFindById.mockResolvedValue(null);

    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "PAY-1" } } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignorado).toBe(true);
    expect(pagoCreate).not.toHaveBeenCalled();
  });

  it("payment con plan inválido: 200 ignorado", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(payment({ metadata: { plan: "ultra" } })),
        { status: 200 },
      ) as Response,
    );
    const res = await postWebhook(
      armarRequest({ body: { type: "payment", data: { id: "PAY-1" } } }),
    );
    expect(res.status).toBe(200);
    expect(pagoCreate).not.toHaveBeenCalled();
  });
});
