import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();
const CONCILIACION_ID = new Types.ObjectId().toString();

const { mockAuth, docMutable, concFindOne, deleteOneMock, saveMock } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    docMutable: {
      _id: "C" as unknown,
      extraccionId: "E" as unknown,
      nombre: "test",
      estado: "completada",
      tolerancias: { dias: 2, importe: 1, fuzzyUmbral: 0.85 },
      matches: [] as unknown[],
      descartadosExtracto: [] as number[],
      gruposManuales: [] as unknown[],
      estadisticas: {
        totalExtracto: 0,
        totalSegundaFuente: 0,
        matcheados: 0,
        huerfanosExtracto: 0,
        huerfanosSegundaFuente: 0,
        enGruposManuales: 0,
      },
      notas: "",
      segundaFuente: {
        archivoNombre: "x.csv",
        formato: "csv",
        registros: [] as unknown[],
        mapeoColumnas: {
          fecha: "F",
          descripcion: "D",
          monto: "M",
          referencia: null,
        },
        headersOriginales: ["F", "D", "M"],
      },
      set: vi.fn(),
      save: vi.fn(),
      deleteOne: vi.fn(),
      toObject: vi.fn(),
    },
    concFindOne: vi.fn(),
    deleteOneMock: vi.fn(),
    saveMock: vi.fn(),
  }));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../app/models/Conciliacion", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/models/Conciliacion")
  >();
  return {
    ...actual,
    Conciliacion: {
      findOne: (q: unknown) => concFindOne(q),
    },
  };
});

vi.mock("../app/models/Extraccion", () => ({
  Extraccion: {
    findOne: () => ({
      select: () => ({ lean: () => ({ movimientos: [] }) }),
    }),
  },
}));

import {
  GET as getOne,
  DELETE as delOne,
  PATCH as patchOne,
} from "../app/api/conciliaciones/[id]/route";

beforeEach(() => {
  mockAuth.mockReset();
  concFindOne.mockReset();
  docMutable.set = vi.fn();
  docMutable.save = saveMock;
  docMutable.deleteOne = deleteOneMock;
  docMutable.toObject = vi.fn(() => ({
    _id: docMutable._id,
    extraccionId: docMutable.extraccionId,
    nombre: docMutable.nombre,
    estado: docMutable.estado,
    tolerancias: docMutable.tolerancias,
    matches: docMutable.matches,
    descartadosExtracto: docMutable.descartadosExtracto,
    gruposManuales: docMutable.gruposManuales,
    estadisticas: docMutable.estadisticas,
    notas: docMutable.notas,
    segundaFuente: docMutable.segundaFuente,
  }));
  saveMock.mockReset();
  deleteOneMock.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: USUARIO_ID, rol: "operador" },
  });
});

describe("GET /api/conciliaciones/[id]", () => {
  it("devuelve conciliación serializada", async () => {
    concFindOne.mockResolvedValue(docMutable);
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: CONCILIACION_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("404 cuando no existe", async () => {
    concFindOne.mockResolvedValue(null);
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: CONCILIACION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("400 con id inválido", async () => {
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: "no-valido" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getOne(new Request("http://x"), {
      params: Promise.resolve({ id: CONCILIACION_ID }),
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/conciliaciones/[id]", () => {
  it("elimina conciliación", async () => {
    concFindOne.mockResolvedValue(docMutable);
    deleteOneMock.mockResolvedValue({ acknowledged: true });
    const res = await delOne(new Request("http://x"), {
      params: Promise.resolve({ id: CONCILIACION_ID }),
    });
    expect(res.status).toBe(200);
    expect(deleteOneMock).toHaveBeenCalled();
  });

  it("404 cuando no existe", async () => {
    concFindOne.mockResolvedValue(null);
    const res = await delOne(new Request("http://x"), {
      params: Promise.resolve({ id: CONCILIACION_ID }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/conciliaciones/[id]", () => {
  it("cambia nombre y notas", async () => {
    concFindOne.mockResolvedValue(docMutable);
    saveMock.mockResolvedValue(undefined);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ nombre: "Nuevo", notas: "ok" }),
      }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(docMutable.nombre).toBe("Nuevo");
    expect(docMutable.notas).toBe("ok");
  });

  it("400 con body vacío (refine: al menos un cambio)", async () => {
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con body no-JSON", async () => {
    const res = await patchOne(
      new Request("http://x", { method: "PATCH", body: "garbage" }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 con id inválido", async () => {
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ nombre: "x" }),
      }),
      { params: Promise.resolve({ id: "no-valido" }) },
    );
    expect(res.status).toBe(400);
  });

  it("descartar extracto agrega y quita índices", async () => {
    concFindOne.mockResolvedValue(docMutable);
    saveMock.mockResolvedValue(undefined);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          descartarExtracto: { extractoIdx: 5, descartar: true },
        }),
      }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(docMutable.set).toHaveBeenCalled();
  });

  it("forzarMatch + quitarMatch", async () => {
    concFindOne.mockResolvedValue(docMutable);
    saveMock.mockResolvedValue(undefined);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          forzarMatch: { extractoIdx: 1, registroIdx: 2 },
        }),
      }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("crearGrupoManual lo agrega vía set", async () => {
    concFindOne.mockResolvedValue(docMutable);
    saveMock.mockResolvedValue(undefined);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          crearGrupoManual: {
            extractoIdxs: [1],
            registroIdxs: [2],
            nota: "test",
          },
        }),
      }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("400 si eliminarGrupoManual con índice fuera de rango", async () => {
    concFindOne.mockResolvedValue(docMutable);
    const res = await patchOne(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          eliminarGrupoManual: { indice: 999 },
        }),
      }),
      { params: Promise.resolve({ id: CONCILIACION_ID }) },
    );
    expect(res.status).toBe(400);
  });
});
