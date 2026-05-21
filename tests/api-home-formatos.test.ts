import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockConstruir, formatoFind, perfilFind } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConstruir: vi.fn(),
  formatoFind: vi.fn(),
  perfilFind: vi.fn(),
}));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../app/lib/home-resumen", () => ({
  construirHomeResumen: mockConstruir,
}));

vi.mock("../app/models/FormatoAprendido", () => ({
  FormatoAprendido: {
    find: () => ({
      sort: () => ({
        limit: () => ({ lean: () => formatoFind() }),
      }),
    }),
  },
}));

vi.mock("../app/models/PerfilExtraccion", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/models/PerfilExtraccion")
  >();
  return {
    ...actual,
    PerfilExtraccion: {
      find: () => ({
        select: () => ({ lean: () => perfilFind() }),
      }),
    },
  };
});

import { GET as getResumen } from "../app/api/home/resumen/route";
import { GET as getFormatos } from "../app/api/formatos/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockConstruir.mockReset();
  formatoFind.mockReset();
  perfilFind.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: "u1", rol: "operador" },
  });
});

describe("GET /api/home/resumen", () => {
  it("devuelve resumen", async () => {
    mockConstruir.mockResolvedValue({
      bancos: [],
      destacados: [],
      favoritos: [],
      ultimos: [],
    });
    const res = await getResumen();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("bancos");
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getResumen();
    expect(res.status).toBe(401);
  });

  it("500 si falla el construir", async () => {
    mockConstruir.mockRejectedValue(new Error("db down"));
    const res = await getResumen();
    expect(res.status).toBe(500);
  });
});

describe("GET /api/formatos", () => {
  it("lista formatos sin filtros", async () => {
    formatoFind.mockResolvedValue([
      {
        _id: "f1",
        perfilId: "p1",
        huella: "h1",
        resumenHuella: "x",
        reglaRegex: null,
        reglaActiva: false,
        stats: {},
        notas: "",
        activo: true,
      },
    ]);
    const res = await getFormatos(new Request("http://x/api/formatos"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
  });

  it("filtra por entidad (vía PerfilExtraccion lookup)", async () => {
    perfilFind.mockResolvedValue([
      { _id: "p1" },
      { _id: "p2" },
    ]);
    formatoFind.mockResolvedValue([]);
    const res = await getFormatos(
      new Request("http://x/api/formatos?entidad=galicia"),
    );
    expect(res.status).toBe(200);
  });

  it("devuelve vacío si entidad no tiene perfiles", async () => {
    perfilFind.mockResolvedValue([]);
    const res = await getFormatos(
      new Request("http://x/api/formatos?entidad=inexistente"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it("acepta filtro reglaActiva y q", async () => {
    formatoFind.mockResolvedValue([]);
    const res = await getFormatos(
      new Request("http://x/api/formatos?reglaActiva=true&q=fragmento"),
    );
    expect(res.status).toBe(200);
  });

  it("400 con query inválida", async () => {
    const res = await getFormatos(
      new Request("http://x/api/formatos?limite=invalid"),
    );
    expect(res.status).toBe(400);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getFormatos(new Request("http://x/api/formatos"));
    expect(res.status).toBe(401);
  });
});
