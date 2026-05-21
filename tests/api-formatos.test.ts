import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const FORMATO_ID = new Types.ObjectId().toString();

const { mockAuth, formatoFindById, formatoFindByIdAndUpdate } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    formatoFindById: vi.fn(),
    formatoFindByIdAndUpdate: vi.fn(),
  }),
);

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../app/models/FormatoAprendido", () => ({
  FormatoAprendido: {
    findById: (id: string) => {
      const chain = {
        lean: () => formatoFindById(id),
        select: () => ({ lean: () => formatoFindById(id) }),
      };
      return chain;
    },
    findByIdAndUpdate: (id: string, update: unknown, opts: unknown) => ({
      lean: () => formatoFindByIdAndUpdate(id, update, opts),
    }),
  },
}));

import {
  GET as getFormato,
  PATCH as patchFormato,
  DELETE as delFormato,
} from "../app/api/formatos/[id]/route";
import { POST as probarFormato } from "../app/api/formatos/[id]/probar/route";

const formatoFixture = {
  _id: FORMATO_ID,
  perfilId: "p1",
  huella: "h1",
  resumenHuella: "x",
  reglaRegex: null,
  reglaActiva: false,
  stats: {},
  notas: "",
  activo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  mockAuth.mockReset();
  formatoFindById.mockReset();
  formatoFindByIdAndUpdate.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: "u1", rol: "admin" },
  });
});

describe("GET /api/formatos/[id]", () => {
  it("devuelve formato", async () => {
    formatoFindById.mockResolvedValue(formatoFixture);
    const res = await getFormato(new Request("http://x"), {
      params: Promise.resolve({ id: FORMATO_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("404 cuando no existe", async () => {
    formatoFindById.mockResolvedValue(null);
    const res = await getFormato(new Request("http://x"), {
      params: Promise.resolve({ id: FORMATO_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("400 con id inválido", async () => {
    const res = await getFormato(new Request("http://x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/formatos/[id]", () => {
  it("actualiza notas", async () => {
    formatoFindByIdAndUpdate.mockResolvedValue(formatoFixture);
    const res = await patchFormato(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ notas: "nueva nota" }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("400 si activan regla sin regex guardado", async () => {
    formatoFindById.mockResolvedValue({ reglaRegex: null });
    const res = await patchFormato(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ reglaActiva: true }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 si reglaActiva=true + reglaRegex=null en el mismo body", async () => {
    const res = await patchFormato(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ reglaActiva: true, reglaRegex: null }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con regex inválido", async () => {
    const res = await patchFormato(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ reglaRegex: "[invalido(" }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", rol: "operador" } });
    const res = await patchFormato(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ notas: "x" }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it("400 con body no-JSON", async () => {
    const res = await patchFormato(
      new Request("http://x", { method: "PATCH", body: "garbage" }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con id inválido", async () => {
    const res = await patchFormato(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ notas: "x" }),
      }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/formatos/[id]", () => {
  it("desactiva formato (activo=false, reglaActiva=false)", async () => {
    formatoFindByIdAndUpdate.mockResolvedValue(formatoFixture);
    const res = await delFormato(new Request("http://x"), {
      params: Promise.resolve({ id: FORMATO_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("404 si no existe", async () => {
    formatoFindByIdAndUpdate.mockResolvedValue(null);
    const res = await delFormato(new Request("http://x"), {
      params: Promise.resolve({ id: FORMATO_ID }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/formatos/[id]/probar", () => {
  it("aplica regla del body con texto provisto", async () => {
    formatoFindById.mockResolvedValue({ reglaRegex: null });
    const regex = String.raw`^(?<fecha>\d{2}/\d{2}/\d{2})\s+(?<descripcion>.+)$`;
    const texto = "01/01/26 pago tarjeta supermercado del barrio";
    const res = await probarFormato(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto, reglaRegex: regex }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("matchRate");
    expect(body).toHaveProperty("muestra");
  });

  it("usa regla guardada cuando no se manda en body", async () => {
    const regex = String.raw`^(?<fecha>\d{2}/\d{2}/\d{2})\s+(?<descripcion>.+)$`;
    formatoFindById.mockResolvedValue({ reglaRegex: regex });
    const res = await probarFormato(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          texto: "01/01/26 pago tarjeta supermercado",
        }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("400 cuando no hay regla guardada ni en body", async () => {
    formatoFindById.mockResolvedValue({ reglaRegex: null });
    const res = await probarFormato(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto: "x" }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("404 si formato no existe", async () => {
    formatoFindById.mockResolvedValue(null);
    const res = await probarFormato(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          texto: "una linea suficientemente larga",
          reglaRegex: ".*",
        }),
      }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("400 con body inválido", async () => {
    const res = await probarFormato(
      new Request("http://x", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: FORMATO_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con id inválido", async () => {
    const res = await probarFormato(
      new Request("http://x", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(400);
  });
});
