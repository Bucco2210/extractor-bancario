import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, perfilFind, detectarPerfilMock } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  perfilFind: vi.fn(),
  detectarPerfilMock: vi.fn(),
}));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

vi.mock("../app/lib/detector-perfil", () => ({
  detectarPerfil: detectarPerfilMock,
}));

import { POST as postDetectar } from "../app/api/perfiles/detectar/route";

beforeEach(() => {
  mockAuth.mockReset();
  perfilFind.mockReset();
  detectarPerfilMock.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: "u1", rol: "operador" },
  });
});

const TEXTO_LARGO =
  "Banco Galicia Resumen de cuenta corriente período 01/01/26 al 31/01/26 cliente persona física";

describe("POST /api/perfiles/detectar", () => {
  it("happy path: devuelve mejor + candidatos", async () => {
    perfilFind.mockResolvedValue([
      {
        _id: "p1",
        slug: "galicia",
        entidad: { nombre: "Galicia" },
        nombre: "CC ARS",
        categoria: "banco",
        tipoDocumento: "extracto_bancario",
        monedaPrimaria: "ARS",
        huella: { palabrasClave: ["galicia"] },
      },
    ]);
    detectarPerfilMock.mockResolvedValue({
      mejor: { perfilId: "p1", slug: "galicia", score: 0.95 },
      candidatos: [{ perfilId: "p1", slug: "galicia", score: 0.95 }],
      modelo: "gpt-4o-mini",
      tokensInput: 100,
      tokensOutput: 50,
      tiempoMs: 800,
    });
    const res = await postDetectar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto: TEXTO_LARGO, topN: 3 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mejor.slug).toBe("galicia");
    expect(body._meta.totalCandidatos).toBe(1);
  });

  it("422 cuando no hay perfiles activos", async () => {
    perfilFind.mockResolvedValue([]);
    const res = await postDetectar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto: TEXTO_LARGO }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("400 con texto muy corto (<50)", async () => {
    const res = await postDetectar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto: "muy corto" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 con body no-JSON", async () => {
    const res = await postDetectar(
      new Request("http://x", { method: "POST", body: "no json" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 con topN fuera de rango", async () => {
    const res = await postDetectar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto: TEXTO_LARGO, topN: 100 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await postDetectar(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ texto: TEXTO_LARGO }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
