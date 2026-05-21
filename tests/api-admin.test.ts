import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();
const OTRO_USUARIO_ID = new Types.ObjectId().toString();

const {
  mockAuth,
  usuarioExists,
  usuarioFind,
  usuarioFindById,
  usuarioFindByIdSelectLean,
  usuarioCountDocs,
  usuarioAggregate,
  invitacionCreate,
  invitacionFindOne,
  pagoCreate,
  pagoFind,
  pagoAggregate,
  extraccionCountDocs,
  extraccionAggregate,
  conciliacionCountDocs,
  hashearMock,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  usuarioExists: vi.fn(),
  usuarioFind: vi.fn(),
  usuarioFindById: vi.fn(),
  usuarioFindByIdSelectLean: vi.fn(),
  usuarioCountDocs: vi.fn(),
  usuarioAggregate: vi.fn(),
  invitacionCreate: vi.fn(),
  invitacionFindOne: vi.fn(),
  pagoCreate: vi.fn(),
  pagoFind: vi.fn(),
  pagoAggregate: vi.fn(),
  extraccionCountDocs: vi.fn(),
  extraccionAggregate: vi.fn(),
  conciliacionCountDocs: vi.fn(),
  hashearMock: vi.fn(async (s: string) => `hash:${s}`),
}));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../app/lib/password", () => ({
  hashearPassword: hashearMock,
}));

vi.mock("../app/models/Usuario", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/models/Usuario")>();
  return {
    ...actual,
    Usuario: {
      exists: (q: unknown) => usuarioExists(q),
      find: () => ({
        select: () => ({
          sort: () => ({
            limit: () => ({ lean: () => usuarioFind() }),
          }),
        }),
      }),
      findById: (id: unknown) => {
        const ret = usuarioFindById(id);
        return {
          select: () => ({ lean: () => usuarioFindByIdSelectLean(id) }),
          then: (cb: (v: unknown) => unknown) => cb(ret),
        };
      },
      create: vi.fn(async (data: unknown) => ({
        _id: new Types.ObjectId(),
        ...(data as Record<string, unknown>),
      })),
      countDocuments: () => usuarioCountDocs(),
      aggregate: (pipeline: unknown[]) => usuarioAggregate(pipeline),
    },
  };
});

vi.mock("../app/models/Invitacion", () => ({
  Invitacion: {
    create: (data: unknown) => invitacionCreate(data),
    findOne: (q: unknown) => invitacionFindOne(q),
  },
}));

vi.mock("../app/models/Pago", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/models/Pago")>();
  return {
    ...actual,
    Pago: {
      create: (data: unknown) => pagoCreate(data),
      find: () => ({
        sort: () => ({
          limit: () => ({ lean: () => pagoFind() }),
        }),
      }),
      aggregate: (pipeline: unknown[]) => pagoAggregate(pipeline),
    },
  };
});

vi.mock("../app/models/Extraccion", () => ({
  Extraccion: {
    countDocuments: (q?: unknown) => extraccionCountDocs(q),
    aggregate: (pipeline: unknown[]) => extraccionAggregate(pipeline),
  },
}));

vi.mock("../app/models/Conciliacion", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/models/Conciliacion")
  >();
  return {
    ...actual,
    Conciliacion: {
      countDocuments: (q?: unknown) => conciliacionCountDocs(q),
    },
  };
});

import { POST as postInvitar } from "../app/api/admin/usuarios/invitar/route";
import { POST as postAceptar } from "../app/api/auth/aceptar-invitacion/route";
import { GET as getUsuarios } from "../app/api/admin/usuarios/route";
import { POST as postPago, GET as getPagos } from "../app/api/admin/pagos/route";
import { GET as getMetricas } from "../app/api/admin/metricas/route";
import { GET as getMiPlan } from "../app/api/usuarios/me/plan/route";

beforeEach(() => {
  for (const fn of [
    usuarioExists,
    usuarioFind,
    usuarioFindById,
    usuarioFindByIdSelectLean,
    usuarioCountDocs,
    usuarioAggregate,
    invitacionCreate,
    invitacionFindOne,
    pagoCreate,
    pagoFind,
    pagoAggregate,
    extraccionCountDocs,
    extraccionAggregate,
    conciliacionCountDocs,
  ]) {
    fn.mockReset();
  }
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: USUARIO_ID, rol: "admin" },
  });
});

describe("POST /api/admin/usuarios/invitar", () => {
  it("crea invitación + devuelve token y link", async () => {
    usuarioExists.mockResolvedValue(null);
    invitacionCreate.mockResolvedValue({ _id: new Types.ObjectId() });
    const res = await postInvitar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          email: "nuevo@cliente.com",
          planSugerido: "pro",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("nuevo@cliente.com");
    expect(body.token).toHaveLength(64);
    expect(body.link).toMatch(/^\/registro\//);
  });

  it("422 si ya existe usuario con ese email", async () => {
    usuarioExists.mockResolvedValue({ _id: new Types.ObjectId() });
    const res = await postInvitar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ email: "ya@existe.com" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", rol: "operador" } });
    const res = await postInvitar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ email: "x@y.com" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 con email inválido", async () => {
    const res = await postInvitar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ email: "no-es-email" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 con body no-JSON", async () => {
    const res = await postInvitar(
      new Request("http://x", { method: "POST", body: "x" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/aceptar-invitacion", () => {
  const TOKEN = "a".repeat(64);

  it("crea usuario + marca invitación usada", async () => {
    const futuro = new Date(Date.now() + 7 * 86_400_000);
    const invDoc = {
      _id: new Types.ObjectId(),
      token: TOKEN,
      email: "nuevo@cliente.com",
      nombre: "Nuevo",
      planSugerido: "pro",
      cicloSugerido: "mensual",
      expiraEn: futuro,
      usadaEn: null,
      creadaPor: new Types.ObjectId(),
      save: vi.fn(async () => undefined),
    };
    invitacionFindOne.mockResolvedValue(invDoc);
    usuarioExists.mockResolvedValue(null);

    const res = await postAceptar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ token: TOKEN, password: "secreta123" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("nuevo@cliente.com");
    expect(body.plan).toBe("pro");
    expect(invDoc.save).toHaveBeenCalled();
  });

  it("404 si token no existe", async () => {
    invitacionFindOne.mockResolvedValue(null);
    const res = await postAceptar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ token: TOKEN, password: "secreta123" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("422 si ya fue usada", async () => {
    invitacionFindOne.mockResolvedValue({
      token: TOKEN,
      email: "x@y.com",
      planSugerido: "trial",
      cicloSugerido: "mensual",
      expiraEn: new Date(Date.now() + 86_400_000),
      usadaEn: new Date(),
      creadaPor: new Types.ObjectId(),
      save: vi.fn(),
    });
    const res = await postAceptar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ token: TOKEN, password: "secreta123" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("422 si está vencida", async () => {
    invitacionFindOne.mockResolvedValue({
      token: TOKEN,
      email: "x@y.com",
      planSugerido: "trial",
      cicloSugerido: "mensual",
      expiraEn: new Date(Date.now() - 86_400_000),
      usadaEn: null,
      creadaPor: new Types.ObjectId(),
      save: vi.fn(),
    });
    const res = await postAceptar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ token: TOKEN, password: "secreta123" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("400 con password muy corta", async () => {
    const res = await postAceptar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ token: TOKEN, password: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/usuarios", () => {
  it("lista usuarios con filtros", async () => {
    usuarioFind.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        email: "u@x.com",
        nombre: "U",
        rol: "operador",
        activo: true,
        planInfo: {
          plan: "plus",
          cicloFacturacion: "mensual",
          cicloInicio: new Date(),
          cicloFin: new Date(),
          extraccionesEnPeriodo: 0,
          conciliacionesEnPeriodo: 0,
          estadoCuenta: "activa",
        },
      },
    ]);
    const res = await getUsuarios(
      new Request("http://x/api/admin/usuarios?plan=plus"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].plan).toBe("plus");
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", rol: "operador" } });
    const res = await getUsuarios(new Request("http://x/api/admin/usuarios"));
    expect(res.status).toBe(403);
  });

  it("400 con query inválida", async () => {
    const res = await getUsuarios(
      new Request("http://x/api/admin/usuarios?limite=99999"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/pagos", () => {
  it("registra pago + extiende planInfo", async () => {
    const usuarioDoc = {
      _id: new Types.ObjectId(OTRO_USUARIO_ID),
      planInfo: null,
      save: vi.fn(async () => undefined),
    };
    usuarioFindById.mockReturnValue(usuarioDoc);
    pagoCreate.mockResolvedValue({ _id: new Types.ObjectId() });

    const res = await postPago(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          usuarioId: OTRO_USUARIO_ID,
          plan: "pro",
          cicloFacturacion: "mensual",
          monto: 49,
          moneda: "USD",
          notas: "transferencia 21/05",
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(usuarioDoc.save).toHaveBeenCalled();
    expect(pagoCreate).toHaveBeenCalledOnce();
  });

  it("404 si usuario no existe", async () => {
    usuarioFindById.mockReturnValue(null);
    const res = await postPago(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          usuarioId: OTRO_USUARIO_ID,
          plan: "pro",
          cicloFacturacion: "mensual",
          monto: 49,
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("400 con monto no positivo", async () => {
    const res = await postPago(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          usuarioId: OTRO_USUARIO_ID,
          plan: "pro",
          cicloFacturacion: "mensual",
          monto: -10,
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", rol: "operador" } });
    const res = await postPago(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          usuarioId: OTRO_USUARIO_ID,
          plan: "pro",
          cicloFacturacion: "mensual",
          monto: 49,
        }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/pagos", () => {
  it("lista pagos", async () => {
    pagoFind.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        usuarioId: new Types.ObjectId(),
        plan: "pro",
        cicloFacturacion: "mensual",
        monto: 49,
        moneda: "USD",
        periodoInicio: new Date(),
        periodoFin: new Date(),
        estado: "confirmado",
        fuente: "manual",
      },
    ]);
    const res = await getPagos(new Request("http://x/api/admin/pagos"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
  });
});

describe("GET /api/admin/metricas", () => {
  it("devuelve dashboard KPI", async () => {
    usuarioCountDocs.mockResolvedValue(5);
    usuarioAggregate.mockResolvedValue([
      { _id: "plus", count: 2 },
      { _id: "pro", count: 3 },
    ]);
    extraccionCountDocs.mockResolvedValue(100);
    extraccionAggregate.mockResolvedValue([{ _id: null, input: 1000, output: 500 }]);
    pagoAggregate.mockResolvedValue([
      { _id: "USD", total: 196, cantidad: 4 },
    ]);
    conciliacionCountDocs.mockResolvedValue(20);

    const res = await getMetricas();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usuarios.total).toBe(5);
    expect(body.extracciones.total).toBe(100);
    expect(body.ingresos.total.USD.total).toBe(196);
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", rol: "operador" } });
    const res = await getMetricas();
    expect(res.status).toBe(403);
  });
});

describe("GET /api/usuarios/me/plan", () => {
  it("devuelve plan + uso del usuario", async () => {
    mockAuth.mockResolvedValue({ user: { id: USUARIO_ID, rol: "operador" } });
    usuarioFindByIdSelectLean.mockResolvedValue({
      _id: USUARIO_ID,
      email: "u@x.com",
      nombre: "U",
      rol: "operador",
      planInfo: {
        plan: "pro",
        cicloFacturacion: "mensual",
        cicloInicio: new Date(),
        cicloFin: new Date(),
        extraccionesEnPeriodo: 5,
        conciliacionesEnPeriodo: 2,
        estadoCuenta: "activa",
      },
    });
    const res = await getMiPlan();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.id).toBe("pro");
    expect(body.plan.usado.extracciones).toBe(5);
    expect(body.plan.limites.extracciones).toBe(75);
  });

  it("devuelve mensaje si usuario sin plan asignado", async () => {
    mockAuth.mockResolvedValue({ user: { id: USUARIO_ID, rol: "operador" } });
    usuarioFindByIdSelectLean.mockResolvedValue({
      _id: USUARIO_ID,
      email: "u@x.com",
      nombre: "U",
      rol: "operador",
      planInfo: null,
    });
    const res = await getMiPlan();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe(null);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getMiPlan();
    expect(res.status).toBe(401);
  });
});
