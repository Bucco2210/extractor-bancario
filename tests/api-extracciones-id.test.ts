import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";
import { cifrar, cifrarMovimientos } from "../app/lib/cifrado";

const USUARIO_ID = new Types.ObjectId().toString();
const EXTRACCION_ID = new Types.ObjectId().toString();
const PERFIL_ID = new Types.ObjectId().toString();

const {
  mockAuth,
  extrFindOne,
  extrUpdateOne,
  perfilFindByIdSelectLean,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  extrFindOne: vi.fn(),
  extrUpdateOne: vi.fn(),
  perfilFindByIdSelectLean: vi.fn(),
}));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../app/models/Extraccion", () => ({
  Extraccion: {
    findOne: (q: unknown) => ({ lean: () => extrFindOne(q) }),
    updateOne: extrUpdateOne,
  },
}));

vi.mock("../app/models/PerfilExtraccion", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/models/PerfilExtraccion")
  >();
  return {
    ...actual,
    PerfilExtraccion: {
      findById: (_id: string) => ({
        select: () => ({ lean: () => perfilFindByIdSelectLean(_id) }),
      }),
    },
  };
});

vi.mock("../app/lib/excel", () => ({
  exportarMovimientosExcel: vi.fn(async () =>
    Buffer.from("xlsx-fake-content"),
  ),
}));

import {
  GET as getExtraccion,
  PATCH as patchExtraccion,
} from "../app/api/extracciones/[id]/route";
import { GET as getExtraccionExcel } from "../app/api/extracciones/[id]/excel/route";

function docExtraccionFixture(): Record<string, unknown> {
  return {
    _id: EXTRACCION_ID,
    usuarioId: USUARIO_ID,
    perfilId: PERFIL_ID,
    banco: "galicia",
    cuenta: cifrar("0001-2345"),
    titular: cifrar("Juan Pérez"),
    periodo: "ene-2026",
    estado: "extraido",
    fuente: "openai",
    huella: "abc",
    formatoAprendidoId: null,
    movimientos: cifrarMovimientos([
      {
        fecha: "01/01/2026",
        descripcion: "Transfer",
        referencia: "R1",
        debito: null,
        credito: 100,
        saldo: 100,
      },
    ]),
    archivo: { nombre: "x.pdf", tamano: 100, contentType: "application/pdf" },
    error: null,
    _meta: {
      modelo: "gpt-4o-mini",
      tokensInput: 10,
      tokensOutput: 20,
      tiempoMs: 1000,
      paginasTotal: 1,
      chunksTotal: 1,
      chunksOk: 1,
      chunksFallidos: [],
    },
  };
}

beforeEach(() => {
  mockAuth.mockReset();
  extrFindOne.mockReset();
  extrUpdateOne.mockReset();
  perfilFindByIdSelectLean.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: USUARIO_ID, rol: "operador" },
  });
});

describe("GET /api/extracciones/[id]", () => {
  it("devuelve doc descifrado", async () => {
    extrFindOne.mockResolvedValue(docExtraccionFixture());
    const res = await getExtraccion(new Request("http://x"), {
      params: Promise.resolve({ id: EXTRACCION_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cuenta).toBe("0001-2345");
    expect(body.titular).toBe("Juan Pérez");
    expect(body.movimientos[0].descripcion).toBe("Transfer");
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getExtraccion(new Request("http://x"), {
      params: Promise.resolve({ id: EXTRACCION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("400 con id inválido", async () => {
    const res = await getExtraccion(new Request("http://x"), {
      params: Promise.resolve({ id: "no-valido" }),
    });
    expect(res.status).toBe(400);
  });

  it("404 cuando no existe", async () => {
    extrFindOne.mockResolvedValue(null);
    const res = await getExtraccion(new Request("http://x"), {
      params: Promise.resolve({ id: EXTRACCION_ID }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/extracciones/[id]", () => {
  it("asigna perfil OK", async () => {
    perfilFindByIdSelectLean.mockResolvedValue({
      _id: new Types.ObjectId(PERFIL_ID),
      entidad: { nombre: "Galicia" },
      activo: true,
    });
    extrUpdateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await patchExtraccion(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ perfilId: PERFIL_ID }),
      }),
      { params: Promise.resolve({ id: EXTRACCION_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("422 si perfil está inactivo", async () => {
    perfilFindByIdSelectLean.mockResolvedValue({
      _id: PERFIL_ID,
      entidad: { nombre: "X" },
      activo: false,
    });
    const res = await patchExtraccion(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ perfilId: PERFIL_ID }),
      }),
      { params: Promise.resolve({ id: EXTRACCION_ID }) },
    );
    expect(res.status).toBe(422);
  });

  it("404 si perfil no existe", async () => {
    perfilFindByIdSelectLean.mockResolvedValue(null);
    const res = await patchExtraccion(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ perfilId: PERFIL_ID }),
      }),
      { params: Promise.resolve({ id: EXTRACCION_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("404 si extracción no existe (matchedCount=0)", async () => {
    perfilFindByIdSelectLean.mockResolvedValue({
      _id: new Types.ObjectId(PERFIL_ID),
      entidad: { nombre: "X" },
      activo: true,
    });
    extrUpdateOne.mockResolvedValue({ matchedCount: 0 });
    const res = await patchExtraccion(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ perfilId: PERFIL_ID }),
      }),
      { params: Promise.resolve({ id: EXTRACCION_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("400 con perfilId no-ObjectId", async () => {
    const res = await patchExtraccion(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ perfilId: "no-valido" }),
      }),
      { params: Promise.resolve({ id: EXTRACCION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con body no-JSON", async () => {
    const res = await patchExtraccion(
      new Request("http://x", { method: "PATCH", body: "x" }),
      { params: Promise.resolve({ id: EXTRACCION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con id inválido", async () => {
    const res = await patchExtraccion(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ perfilId: PERFIL_ID }),
      }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/extracciones/[id]/excel", () => {
  it("genera xlsx con movimientos descifrados", async () => {
    extrFindOne.mockResolvedValue(docExtraccionFixture());
    const res = await getExtraccionExcel(new Request("http://x"), {
      params: Promise.resolve({ id: EXTRACCION_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("404 cuando no existe", async () => {
    extrFindOne.mockResolvedValue(null);
    const res = await getExtraccionExcel(new Request("http://x"), {
      params: Promise.resolve({ id: EXTRACCION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("400 con id inválido", async () => {
    const res = await getExtraccionExcel(new Request("http://x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
