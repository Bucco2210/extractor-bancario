import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();

const { usuarioFindByIdSelectLean, usuarioUpdateOne } = vi.hoisted(() => ({
  usuarioFindByIdSelectLean: vi.fn(),
  usuarioUpdateOne: vi.fn(async () => ({ acknowledged: true })),
}));

vi.mock("../app/models/Usuario", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/models/Usuario")
  >();
  return {
    ...actual,
    Usuario: {
      findById: (_id: unknown) => ({
        select: () => ({ lean: () => usuarioFindByIdSelectLean(_id) }),
      }),
      updateOne: usuarioUpdateOne,
    },
  };
});

import { verificarLimitePlan } from "../app/lib/plan-gate";

function mockPlanInfo(
  override: Partial<{
    plan: string;
    cicloFin: Date;
    extraccionesEnPeriodo: number;
    conciliacionesEnPeriodo: number;
    estadoCuenta: string;
  }> = {},
): void {
  const dentroDe10Dias = new Date(Date.now() + 10 * 86_400_000);
  usuarioFindByIdSelectLean.mockResolvedValue({
    _id: USUARIO_ID,
    planInfo: {
      plan: "plus",
      cicloFacturacion: "mensual",
      cicloInicio: new Date(),
      cicloFin: dentroDe10Dias,
      extraccionesEnPeriodo: 0,
      conciliacionesEnPeriodo: 0,
      estadoCuenta: "activa",
      ...override,
    },
  });
}

beforeEach(() => {
  usuarioFindByIdSelectLean.mockReset();
  usuarioUpdateOne.mockClear();
});

describe("verificarLimitePlan — gates por rol", () => {
  it("admin pasa siempre sin chequeo", async () => {
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "admin",
        accion: "crear_extraccion",
      }),
    ).resolves.toBeUndefined();
    expect(usuarioFindByIdSelectLean).not.toHaveBeenCalled();
  });
});

describe("verificarLimitePlan — happy paths", () => {
  it("plus con cuota disponible pasa e incrementa contador", async () => {
    mockPlanInfo({ extraccionesEnPeriodo: 5 });
    await verificarLimitePlan({
      usuarioId: USUARIO_ID,
      rol: "operador",
      accion: "crear_extraccion",
    });
    expect(usuarioUpdateOne).toHaveBeenCalledOnce();
    const call = usuarioUpdateOne.mock.calls[0] as unknown as [
      unknown,
      { $inc: Record<string, number> },
    ];
    expect(call[1].$inc["planInfo.extraccionesEnPeriodo"]).toBe(1);
  });

  it("premium con conciliación ilimitada nunca topa", async () => {
    mockPlanInfo({
      plan: "premium",
      conciliacionesEnPeriodo: 99_999,
    });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_conciliacion",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("verificarLimitePlan — bloqueos", () => {
  it("plus tira LIMITE_EXCEDIDO al pedir conciliación (límite 0)", async () => {
    mockPlanInfo({ plan: "plus" });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_conciliacion",
      }),
    ).rejects.toMatchObject({ codigo: "LIMITE_EXCEDIDO" });
  });

  it("plus en el límite de extracciones bloquea la próxima", async () => {
    mockPlanInfo({ plan: "plus", extraccionesEnPeriodo: 20 });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).rejects.toMatchObject({ codigo: "LIMITE_EXCEDIDO" });
  });

  it("pro en el límite de conciliaciones bloquea", async () => {
    mockPlanInfo({ plan: "pro", conciliacionesEnPeriodo: 10 });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_conciliacion",
      }),
    ).rejects.toMatchObject({ codigo: "LIMITE_EXCEDIDO" });
  });

  it("estadoCuenta=vencida bloquea (modo lectura)", async () => {
    mockPlanInfo({ estadoCuenta: "vencida" });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).rejects.toMatchObject({ codigo: "LIMITE_EXCEDIDO" });
  });

  it("estadoCuenta=suspendida bloquea", async () => {
    mockPlanInfo({ estadoCuenta: "suspendida" });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).rejects.toMatchObject({ codigo: "LIMITE_EXCEDIDO" });
  });
});

describe("verificarLimitePlan — rotación de ciclo", () => {
  it("trial vencido marca cuenta como vencida y bloquea", async () => {
    const ayer = new Date(Date.now() - 86_400_000);
    mockPlanInfo({ plan: "trial", cicloFin: ayer });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).rejects.toMatchObject({ codigo: "LIMITE_EXCEDIDO" });
    // Marca vencida + NO incrementa contador
    const calls = usuarioUpdateOne.mock.calls as unknown as Array<
      [unknown, { $set?: Record<string, string> }]
    >;
    const marcadoVencida = calls.find(
      (c) => c[1].$set?.["planInfo.estadoCuenta"] === "vencida",
    );
    expect(marcadoVencida).toBeTruthy();
  });

  it("plan pago vencido rota ciclo y pasa", async () => {
    const ayer = new Date(Date.now() - 86_400_000);
    mockPlanInfo({
      plan: "pro",
      cicloFin: ayer,
      extraccionesEnPeriodo: 75,
    });
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).resolves.toBeUndefined();
    // Hubo updateOne con reset de contadores + uno con $inc
    const calls = usuarioUpdateOne.mock.calls as unknown as Array<
      [unknown, { $set?: Record<string, number>; $inc?: Record<string, number> }]
    >;
    const reset = calls.find(
      (c) => c[1].$set?.["planInfo.extraccionesEnPeriodo"] === 0,
    );
    expect(reset).toBeTruthy();
  });
});

describe("verificarLimitePlan — bootstrap", () => {
  it("usuario sin planInfo recibe trial por default y bloquea (límite trial)", async () => {
    usuarioFindByIdSelectLean.mockResolvedValue({
      _id: USUARIO_ID,
      planInfo: null,
    });
    // Trial tiene cuota 3 extracciones; con 0 usadas debería pasar.
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).resolves.toBeUndefined();
    // Hubo updateOne con $set: { planInfo: ... }
    const calls = usuarioUpdateOne.mock.calls as unknown as Array<
      [unknown, { $set?: Record<string, unknown> }]
    >;
    const bootstrap = calls.find((c) => c[1].$set?.planInfo);
    expect(bootstrap).toBeTruthy();
  });
});

describe("verificarLimitePlan — errores de input", () => {
  it("usuario inexistente tira SIN_AUTH", async () => {
    usuarioFindByIdSelectLean.mockResolvedValue(null);
    await expect(
      verificarLimitePlan({
        usuarioId: USUARIO_ID,
        rol: "operador",
        accion: "crear_extraccion",
      }),
    ).rejects.toMatchObject({ codigo: "SIN_AUTH" });
  });
});
