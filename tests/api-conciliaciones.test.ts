import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();
const EXTRACCION_ID = new Types.ObjectId().toString();
const CONCILIACION_ID = new Types.ObjectId().toString();

const {
  mockAuth,
  concFind,
  concFindOne,
  concCreate,
  concDeleteOne,
  concSave,
  extraccionFindOne,
  parserMock,
  matchearMock,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  concFind: vi.fn(),
  concFindOne: vi.fn(),
  concCreate: vi.fn(),
  concDeleteOne: vi.fn(),
  concSave: vi.fn(),
  extraccionFindOne: vi.fn(),
  parserMock: vi.fn(),
  matchearMock: vi.fn(),
}));

vi.mock("../app/lib/auth", () => ({ auth: mockAuth }));
vi.mock("../app/lib/mongo", () => ({ conectarMongoose: vi.fn() }));
vi.mock("../app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../app/lib/plan-gate", () => ({
  verificarLimitePlan: vi.fn(async () => undefined),
}));

vi.mock("../app/models/Conciliacion", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/models/Conciliacion")
  >();
  return {
    ...actual,
    Conciliacion: {
      find: () => ({
        sort: () => ({
          limit: () => ({ lean: () => concFind() }),
        }),
      }),
      findOne: (q: unknown) => {
        const result = concFindOne(q);
        // Cuando se llama .lean() (handler de excel) lo devolvemos directo,
        // sin .lean() (handler PATCH) lo wrap en doc-like.
        return {
          lean: () => result,
          // En PATCH se hace `await leerYAutorizar` que devuelve directamente:
          then: (resolve: (v: unknown) => unknown) => resolve(result),
        };
      },
      create: concCreate,
    },
  };
});

vi.mock("../app/models/Extraccion", () => ({
  Extraccion: {
    findOne: () => ({
      select: () => ({ lean: () => extraccionFindOne() }),
    }),
  },
}));

vi.mock("../app/lib/conciliacion-parser", () => ({
  parsearSegundaFuente: parserMock,
}));

vi.mock("../app/lib/conciliacion-matcheo", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../app/lib/conciliacion-matcheo")
  >();
  return {
    ...actual,
    matchear: matchearMock,
  };
});

import {
  GET as getList,
  POST as postCreate,
} from "../app/api/conciliaciones/route";

beforeEach(() => {
  mockAuth.mockReset();
  concFind.mockReset();
  concFindOne.mockReset();
  concCreate.mockReset();
  concDeleteOne.mockReset();
  concSave.mockReset();
  extraccionFindOne.mockReset();
  parserMock.mockReset();
  matchearMock.mockReset();
  mockAuth.mockResolvedValue({
    user: { id: USUARIO_ID, rol: "operador" },
  });
});

describe("GET /api/conciliaciones", () => {
  it("lista vacía OK", async () => {
    concFind.mockResolvedValue([]);
    const res = await getList(new Request("http://x/api/conciliaciones"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
  });

  it("acepta filtro extraccionId", async () => {
    concFind.mockResolvedValue([]);
    const res = await getList(
      new Request(`http://x/api/conciliaciones?extraccionId=${EXTRACCION_ID}`),
    );
    expect(res.status).toBe(200);
  });

  it("400 con extraccionId inválido", async () => {
    const res = await getList(
      new Request("http://x/api/conciliaciones?extraccionId=no-valido"),
    );
    expect(res.status).toBe(400);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getList(new Request("http://x/api/conciliaciones"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/conciliaciones", () => {
  function formDataConArchivo(opts: {
    nombre?: string;
    extraccionId?: string;
    archivoMime?: string;
    archivoSize?: number;
  } = {}): FormData {
    const fd = new FormData();
    const blob = new Blob(["a,b,c\n1,2,3"], {
      type: opts.archivoMime ?? "text/csv",
    });
    Object.defineProperty(blob, "size", {
      value: opts.archivoSize ?? 100,
    });
    const file = new File([blob], "test.csv", {
      type: opts.archivoMime ?? "text/csv",
    });
    fd.set("archivo", file);
    fd.set("extraccionId", opts.extraccionId ?? EXTRACCION_ID);
    fd.set("nombre", opts.nombre ?? "Test conciliación");
    return fd;
  }

  it("400 sin archivo", async () => {
    const fd = new FormData();
    fd.set("extraccionId", EXTRACCION_ID);
    fd.set("nombre", "x");
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(400);
  });

  it("400 con extraccionId inválido", async () => {
    const fd = formDataConArchivo({ extraccionId: "no-valido" });
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(400);
  });

  it("400 sin nombre", async () => {
    const fd = formDataConArchivo({ nombre: "" });
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(400);
  });

  it("400 con archivo de mime no soportado", async () => {
    const fd = formDataConArchivo({ archivoMime: "application/pdf" });
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(400);
  });

  it("404 cuando la extracción no existe", async () => {
    extraccionFindOne.mockResolvedValue(null);
    const fd = formDataConArchivo();
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(404);
  });

  it("422 cuando el parser devuelve mapeo incompleto", async () => {
    extraccionFindOne.mockResolvedValue({ _id: EXTRACCION_ID, movimientos: [] });
    parserMock.mockResolvedValue({
      ok: false,
      headers: ["Col1", "Col2"],
      camposFaltantes: ["fecha"],
      filas: [],
    });
    const fd = formDataConArchivo();
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(422);
  });

  it("happy path: crea conciliación", async () => {
    extraccionFindOne.mockResolvedValue({
      _id: EXTRACCION_ID,
      movimientos: [],
      banco: "galicia",
    });
    parserMock.mockResolvedValue({
      ok: true,
      data: {
        formato: "csv",
        registros: [],
        mapeoColumnas: {
          fecha: "F",
          descripcion: "D",
          monto: "M",
          referencia: null,
        },
        headers: ["F", "D", "M"],
      },
    });
    matchearMock.mockReturnValue({ matches: [] });
    concCreate.mockResolvedValue({
      _id: CONCILIACION_ID,
      toObject: () => ({
        _id: CONCILIACION_ID,
        extraccionId: EXTRACCION_ID,
        nombre: "Test conciliación",
        estado: "completada",
        segundaFuente: {
          archivoNombre: "test.csv",
          formato: "csv",
          registros: [],
          mapeoColumnas: {
            fecha: "F",
            descripcion: "D",
            monto: "M",
            referencia: null,
          },
          headersOriginales: ["F", "D", "M"],
        },
        tolerancias: { dias: 2, importe: 1, fuzzyUmbral: 0.85 },
        matches: [],
        descartadosExtracto: [],
        gruposManuales: [],
        estadisticas: {},
        notas: "",
      }),
    });
    const fd = formDataConArchivo();
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(201);
  });

  it("401 sin sesión", async () => {
    mockAuth.mockResolvedValue(null);
    const fd = formDataConArchivo();
    const res = await postCreate(
      new Request("http://x/api/conciliaciones", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(401);
  });
});
