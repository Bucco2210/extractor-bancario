import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

const USUARIO_ID = new Types.ObjectId().toString();

const {
  extraccionCountDocs,
  extraccionAggregate,
  conciliacionCountDocs,
} = vi.hoisted(() => ({
  extraccionCountDocs: vi.fn(),
  extraccionAggregate: vi.fn(),
  conciliacionCountDocs: vi.fn(),
}));

vi.mock("../app/models/Extraccion", () => ({
  Extraccion: {
    countDocuments: (q?: unknown) => extraccionCountDocs(q),
    aggregate: (p: unknown[]) => extraccionAggregate(p),
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

import { calcularKpisUsuario } from "../app/lib/kpis-usuario";

beforeEach(() => {
  extraccionCountDocs.mockReset();
  extraccionAggregate.mockReset();
  conciliacionCountDocs.mockReset();
});

describe("calcularKpisUsuario", () => {
  it("agrega countDocuments + aggregates y devuelve el shape esperado", async () => {
    extraccionCountDocs.mockResolvedValueOnce(12); // del ciclo
    conciliacionCountDocs.mockResolvedValueOnce(3); // del ciclo
    extraccionAggregate
      .mockResolvedValueOnce([{ input: 15000, output: 5000 }]) // tokens
      .mockResolvedValueOnce([
        { _id: "extraido", count: 10 },
        { _id: "error", count: 2 },
      ]); // por estado
    extraccionCountDocs.mockResolvedValueOnce(50); // total histórico
    conciliacionCountDocs.mockResolvedValueOnce(20); // total histórico

    const inicio = new Date("2026-05-01T00:00:00Z");
    const fin = new Date("2026-05-31T23:59:59Z");
    const kpis = await calcularKpisUsuario({
      usuarioId: USUARIO_ID,
      cicloInicio: inicio,
      cicloFin: fin,
    });

    expect(kpis.extraccionesEnCiclo).toBe(12);
    expect(kpis.conciliacionesEnCiclo).toBe(3);
    expect(kpis.tokensEnCiclo).toBe(20000);
    expect(kpis.porEstado).toEqual({ extraido: 10, error: 2 });
    expect(kpis.extraccionesTotales).toBe(50);
    expect(kpis.conciliacionesTotales).toBe(20);
  });

  it("filtra por ventana del ciclo cuando se pasa", async () => {
    extraccionCountDocs.mockResolvedValue(0);
    conciliacionCountDocs.mockResolvedValue(0);
    extraccionAggregate.mockResolvedValue([]);
    const inicio = new Date("2026-05-01");
    const fin = new Date("2026-05-31");
    await calcularKpisUsuario({
      usuarioId: USUARIO_ID,
      cicloInicio: inicio,
      cicloFin: fin,
    });
    expect(extraccionCountDocs).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: { $gte: inicio, $lte: fin },
      }),
    );
  });

  it("sin ciclo, no filtra por createdAt", async () => {
    extraccionCountDocs.mockResolvedValue(0);
    conciliacionCountDocs.mockResolvedValue(0);
    extraccionAggregate.mockResolvedValue([]);
    await calcularKpisUsuario({
      usuarioId: USUARIO_ID,
      cicloInicio: null,
      cicloFin: null,
    });
    const llamadasConCiclo = extraccionCountDocs.mock.calls.filter(
      ([q]) => (q as { createdAt?: unknown })?.createdAt !== undefined,
    );
    expect(llamadasConCiclo.length).toBe(0);
  });

  it("tokens = 0 cuando no hay extracciones", async () => {
    extraccionCountDocs.mockResolvedValue(0);
    conciliacionCountDocs.mockResolvedValue(0);
    extraccionAggregate.mockResolvedValue([]);
    const kpis = await calcularKpisUsuario({
      usuarioId: USUARIO_ID,
      cicloInicio: null,
      cicloFin: null,
    });
    expect(kpis.tokensEnCiclo).toBe(0);
    expect(kpis.porEstado).toEqual({});
  });

  it("ignora filas con _id nulo en el agregado de estado", async () => {
    extraccionCountDocs.mockResolvedValueOnce(1);
    conciliacionCountDocs.mockResolvedValueOnce(0);
    extraccionAggregate
      .mockResolvedValueOnce([{ input: 0, output: 0 }])
      .mockResolvedValueOnce([
        { _id: null, count: 1 },
        { _id: "extraido", count: 5 },
      ]);
    extraccionCountDocs.mockResolvedValueOnce(1);
    conciliacionCountDocs.mockResolvedValueOnce(0);

    const kpis = await calcularKpisUsuario({
      usuarioId: USUARIO_ID,
      cicloInicio: null,
      cicloFin: null,
    });
    expect(kpis.porEstado).toEqual({ extraido: 5 });
  });
});
