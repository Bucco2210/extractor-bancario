import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();

const {
  mockAuth,
  usuarioUpdateOne,
  usuarioFindByIdSelectLean,
  perfilExists,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  usuarioUpdateOne: vi.fn(async () => ({ acknowledged: true })),
  usuarioFindByIdSelectLean: vi.fn(),
  perfilExists: vi.fn(),
}));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../app/models/Usuario", () => ({
  Usuario: {
    findById: (_id: unknown) => ({
      select: () => ({ lean: () => usuarioFindByIdSelectLean(_id) }),
    }),
    updateOne: usuarioUpdateOne,
  },
}));

vi.mock("../app/models/PerfilExtraccion", () => ({
  PerfilExtraccion: {
    exists: (q: unknown) => perfilExists(q),
  },
}));

import {
  POST as postFavoritos,
  DELETE as deleteFavoritos,
} from "../app/api/usuarios/favoritos/route";
import {
  GET as getPestanas,
  PUT as putPestanas,
} from "../app/api/usuarios/pestanas/route";

beforeEach(() => {
  mockAuth.mockReset();
  usuarioUpdateOne.mockClear();
  usuarioFindByIdSelectLean.mockReset();
  perfilExists.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: USUARIO_ID, rol: "operador" },
  });
});

describe("POST /api/usuarios/favoritos", () => {
  it("agrega favorito y devuelve lista actualizada", async () => {
    perfilExists.mockResolvedValue(true);
    usuarioFindByIdSelectLean.mockResolvedValue({
      preferencias: { bancosFavoritos: ["galicia"] },
    });
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "POST",
      body: JSON.stringify({ entidadSlug: "galicia" }),
    });
    const res = await postFavoritos(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.favoritos).toEqual(["galicia"]);
    expect(usuarioUpdateOne).toHaveBeenCalledOnce();
  });

  it("404 cuando la entidad no existe", async () => {
    perfilExists.mockResolvedValue(null);
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "POST",
      body: JSON.stringify({ entidadSlug: "inexistente" }),
    });
    const res = await postFavoritos(req);
    expect(res.status).toBe(404);
  });

  it("400 con body sin entidadSlug", async () => {
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await postFavoritos(req);
    expect(res.status).toBe(400);
  });

  it("400 con body no-JSON", async () => {
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "POST",
      body: "no es json",
    });
    const res = await postFavoritos(req);
    expect(res.status).toBe(400);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "POST",
      body: JSON.stringify({ entidadSlug: "galicia" }),
    });
    const res = await postFavoritos(req);
    expect(res.status).toBe(401);
  });

  it("rechaza slug con caracteres inválidos", async () => {
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "POST",
      body: JSON.stringify({ entidadSlug: "no-valido!" }),
    });
    const res = await postFavoritos(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/usuarios/favoritos", () => {
  it("quita favorito y devuelve lista actualizada", async () => {
    usuarioFindByIdSelectLean.mockResolvedValue({
      preferencias: { bancosFavoritos: [] },
    });
    const req = new Request(
      "http://x/api/usuarios/favoritos?entidadSlug=galicia",
      { method: "DELETE" },
    );
    const res = await deleteFavoritos(req);
    expect(res.status).toBe(200);
    expect(usuarioUpdateOne).toHaveBeenCalledOnce();
  });

  it("400 sin query param", async () => {
    const req = new Request("http://x/api/usuarios/favoritos", {
      method: "DELETE",
    });
    const res = await deleteFavoritos(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/usuarios/pestanas", () => {
  it("devuelve pestañas del usuario", async () => {
    usuarioFindByIdSelectLean.mockResolvedValue({
      preferencias: {
        pestanasAbiertas: [
          { id: "t1", extraccionId: "e1", titulo: "uno", activa: true },
        ],
      },
    });
    const res = await getPestanas();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pestanas).toHaveLength(1);
  });

  it("devuelve array vacío si usuario sin preferencias", async () => {
    usuarioFindByIdSelectLean.mockResolvedValue(null);
    const res = await getPestanas();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pestanas).toEqual([]);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getPestanas();
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/usuarios/pestanas", () => {
  it("guarda pestañas + asegura una sola activa", async () => {
    const req = new Request("http://x/api/usuarios/pestanas", {
      method: "PUT",
      body: JSON.stringify({
        pestanas: [
          { id: "t1", extraccionId: "e1", titulo: "uno", activa: true },
          { id: "t2", extraccionId: "e2", titulo: "dos", activa: true },
        ],
      }),
    });
    const res = await putPestanas(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pestanas).toHaveLength(2);
    expect(body.pestanas[0].activa).toBe(true);
    expect(body.pestanas[1].activa).toBe(false);
  });

  it("recorta cuando supera MAX_PESTANAS_ABIERTAS", async () => {
    const pestanasMuchas = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      extraccionId: `e${i}`,
      titulo: `t${i}`,
      activa: i === 0,
    }));
    const req = new Request("http://x/api/usuarios/pestanas", {
      method: "PUT",
      body: JSON.stringify({ pestanas: pestanasMuchas }),
    });
    const res = await putPestanas(req);
    const body = await res.json();
    expect(body.pestanas.length).toBeLessThanOrEqual(body.limite);
    expect(body.recortadas).toBeGreaterThan(0);
  });

  it("400 si body inválido (>50 pestañas)", async () => {
    const req = new Request("http://x/api/usuarios/pestanas", {
      method: "PUT",
      body: JSON.stringify({
        pestanas: Array.from({ length: 60 }, (_, i) => ({
          id: `t${i}`,
          extraccionId: `e${i}`,
          titulo: `t${i}`,
        })),
      }),
    });
    const res = await putPestanas(req);
    expect(res.status).toBe(400);
  });

  it("400 si body no es JSON", async () => {
    const req = new Request("http://x/api/usuarios/pestanas", {
      method: "PUT",
      body: "garbage",
    });
    const res = await putPestanas(req);
    expect(res.status).toBe(400);
  });
});
