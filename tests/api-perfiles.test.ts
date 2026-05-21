import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const ID_PERFIL = new Types.ObjectId().toString();

const {
  mockAuth,
  perfilFind,
  perfilFindById,
  perfilExists,
  perfilCreate,
  perfilFindByIdAndUpdate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  perfilFind: vi.fn(),
  perfilFindById: vi.fn(),
  perfilExists: vi.fn(),
  perfilCreate: vi.fn(),
  perfilFindByIdAndUpdate: vi.fn(),
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
        sort: () => ({
          limit: () => ({ lean: () => perfilFind() }),
        }),
      }),
      findById: (id: string) => ({
        lean: () => perfilFindById(id),
      }),
      exists: (q: unknown) => perfilExists(q),
      create: (data: unknown) => perfilCreate(data),
      findByIdAndUpdate: (id: string, update: unknown, opts: unknown) => ({
        lean: () => perfilFindByIdAndUpdate(id, update, opts),
      }),
    },
  };
});

import { GET as getList, POST as postCreate } from "../app/api/perfiles/route";
import {
  GET as getOne,
  PATCH as patchOne,
  DELETE as delOne,
} from "../app/api/perfiles/[id]/route";

const perfilFixture = {
  _id: ID_PERFIL,
  slug: "galicia-cta-ars",
  nombre: "Galicia CC ARS",
  categoria: "banco",
  tipoDocumento: "extracto_bancario",
  monedaPrimaria: "ARS",
  entidad: { slug: "galicia", nombre: "Galicia", iconoUrl: null },
  promptSistema: "Sos un experto...",
  promptUsuario: "Extraé...",
  esquemaSalida: { tipo: "movimientos_v1" },
  validaciones: {},
  huella: { palabrasClave: ["galicia"] },
  activo: true,
  ordenEnGrid: 10,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
};

beforeEach(() => {
  mockAuth.mockReset();
  perfilFind.mockReset();
  perfilFindById.mockReset();
  perfilExists.mockReset();
  perfilCreate.mockReset();
  perfilFindByIdAndUpdate.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: "u1", rol: "admin" },
  });
});

describe("GET /api/perfiles", () => {
  it("devuelve lista con filtros", async () => {
    perfilFind.mockResolvedValue([perfilFixture]);
    const req = new Request("http://x/api/perfiles?categoria=banco&activo=true");
    const res = await getList(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].slug).toBe("galicia-cta-ars");
  });

  it("acepta query con búsqueda libre `q`", async () => {
    perfilFind.mockResolvedValue([]);
    const req = new Request("http://x/api/perfiles?q=galicia");
    const res = await getList(req);
    expect(res.status).toBe(200);
  });

  it("400 con limite inválido", async () => {
    const req = new Request("http://x/api/perfiles?limite=99999");
    const res = await getList(req);
    expect(res.status).toBe(400);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://x/api/perfiles");
    const res = await getList(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/perfiles", () => {
  const bodyValido = {
    slug: "test_perfil",
    nombre: "Test Perfil",
    categoria: "banco",
    tipoDocumento: "extracto_bancario",
    monedaPrimaria: "ARS",
    entidad: { slug: "test_entidad", nombre: "Test Entidad", iconoUrl: null },
    promptSistema: "x",
    huella: { palabrasClave: [] },
  };

  it("crea perfil cuando slug no existe", async () => {
    perfilExists.mockResolvedValue(null);
    perfilCreate.mockResolvedValue({
      toObject: () => ({ ...perfilFixture, slug: "test-perfil" }),
    });
    const req = new Request("http://x/api/perfiles", {
      method: "POST",
      body: JSON.stringify(bodyValido),
    });
    const res = await postCreate(req);
    expect(res.status).toBe(201);
  });

  it("422 si slug ya existe", async () => {
    perfilExists.mockResolvedValue({ _id: "existing" });
    const req = new Request("http://x/api/perfiles", {
      method: "POST",
      body: JSON.stringify(bodyValido),
    });
    const res = await postCreate(req);
    expect(res.status).toBe(422);
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", rol: "operador" } });
    const req = new Request("http://x/api/perfiles", {
      method: "POST",
      body: JSON.stringify(bodyValido),
    });
    const res = await postCreate(req);
    expect(res.status).toBe(403);
  });

  it("400 con body no-JSON", async () => {
    const req = new Request("http://x/api/perfiles", {
      method: "POST",
      body: "garbage",
    });
    const res = await postCreate(req);
    expect(res.status).toBe(400);
  });

  it("400 con body inválido", async () => {
    const req = new Request("http://x/api/perfiles", {
      method: "POST",
      body: JSON.stringify({ slug: "x" }),
    });
    const res = await postCreate(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/perfiles/[id]", () => {
  it("devuelve perfil cuando existe", async () => {
    perfilFindById.mockResolvedValue(perfilFixture);
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: ID_PERFIL }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("galicia-cta-ars");
  });

  it("404 cuando no existe", async () => {
    perfilFindById.mockResolvedValue(null);
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: ID_PERFIL }),
    });
    expect(res.status).toBe(404);
  });

  it("400 con id inválido", async () => {
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: "no-valido" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/perfiles/[id]", () => {
  it("actualiza perfil", async () => {
    perfilExists.mockResolvedValue(null);
    perfilFindByIdAndUpdate.mockResolvedValue(perfilFixture);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ nombre: "Nuevo" }),
      }),
      { params: Promise.resolve({ id: ID_PERFIL }) },
    );
    expect(res.status).toBe(200);
  });

  it("422 cuando slug nuevo colisiona", async () => {
    perfilExists.mockResolvedValue({ _id: "otro" });
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ slug: "ocupado" }),
      }),
      { params: Promise.resolve({ id: ID_PERFIL }) },
    );
    expect(res.status).toBe(422);
  });

  it("403 si no es admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", rol: "operador" } });
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ nombre: "x" }),
      }),
      { params: Promise.resolve({ id: ID_PERFIL }) },
    );
    expect(res.status).toBe(403);
  });

  it("400 con id inválido", async () => {
    const res = await patchOne(
      new Request("http://x", { method: "PATCH", body: "{}" }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(400);
  });

  it("404 si findByIdAndUpdate devuelve null", async () => {
    perfilExists.mockResolvedValue(null);
    perfilFindByIdAndUpdate.mockResolvedValue(null);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ nombre: "Nuevo" }),
      }),
      { params: Promise.resolve({ id: ID_PERFIL }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/perfiles/[id]", () => {
  it("marca activo=false", async () => {
    perfilFindByIdAndUpdate.mockResolvedValue({ ...perfilFixture, activo: false });
    const res = await delOne(new Request("http://x"), {
      params: Promise.resolve({ id: ID_PERFIL }),
    });
    expect(res.status).toBe(200);
  });

  it("404 si no existe", async () => {
    perfilFindByIdAndUpdate.mockResolvedValue(null);
    const res = await delOne(new Request("http://x"), {
      params: Promise.resolve({ id: ID_PERFIL }),
    });
    expect(res.status).toBe(404);
  });

  it("400 con id inválido", async () => {
    const res = await delOne(new Request("http://x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
