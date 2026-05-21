import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

// ---- Mocks ------------------------------------------------------------------

const { conectarMock, updateOneMock, findByIdMock, registrarFormatoMock, procesarChunksMock } =
  vi.hoisted(() => ({
    conectarMock: vi.fn(async () => undefined),
    updateOneMock: vi.fn(async () => ({ acknowledged: true })),
    findByIdMock: vi.fn(),
    registrarFormatoMock: vi.fn(async () => null),
    procesarChunksMock: vi.fn(),
  }));

vi.mock("../app/lib/mongo", () => ({
  conectarMongoose: conectarMock,
}));

vi.mock("../app/models/Extraccion", () => ({
  Extraccion: {
    updateOne: updateOneMock,
    findById: findByIdMock,
  },
}));

vi.mock("../app/lib/openai", () => ({
  procesarChunks: procesarChunksMock,
}));

vi.mock("../app/lib/aprendizaje", () => ({
  registrarFormatoTrasIA: registrarFormatoMock,
}));

vi.mock("../app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Reimporto después de mockear:
import { correrExtraccion } from "../app/lib/extraccion-runner";

// Vitest infiere mock.calls como tuple vacío cuando se hoistea sin tipos
// genéricos. Para acceder a args en tests sin contaminar con `as any`,
// pasamos por `unknown` y casteamos al shape esperado por caller.
function callsDe(
  mock: { mock: { calls: unknown[] } },
): Array<[unknown, unknown]> {
  return mock.mock.calls as unknown as Array<[unknown, unknown]>;
}

// Helper que hace que findById(...).select(...).lean() devuelva un valor.
function mockFindByIdLean(valor: unknown): void {
  findByIdMock.mockReturnValueOnce({
    select: () => ({
      lean: () => Promise.resolve(valor),
    }),
  });
}

beforeEach(() => {
  conectarMock.mockClear();
  updateOneMock.mockClear();
  findByIdMock.mockReset();
  registrarFormatoMock.mockClear();
  procesarChunksMock.mockReset();
});

// ---- Tests ------------------------------------------------------------------

describe("correrExtraccion", () => {
  it("happy path: 2 chunks ok → estado 'extraido'", async () => {
    procesarChunksMock.mockImplementation(async ({ onChunkOk }) => {
      for (let i = 0; i < 2; i++) {
        await onChunkOk({
          indice: i,
          paginas: [i + 1],
          resultado: {
            cuenta: i === 0 ? "0001-2345" : null,
            titular: i === 0 ? "Pérez" : null,
            periodo: i === 0 ? "ene-2026" : null,
            movimientos: [
              {
                fecha: "01/01/2026",
                descripcion: `mov ${i}`,
                referencia: null,
                debito: null,
                credito: 100,
                saldo: 100,
              },
            ],
          },
          meta: { tokensInput: 10, tokensOutput: 20 },
          ms: 50,
        });
      }
    });
    mockFindByIdLean({ _meta: { chunksFallidos: [] } });

    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [
        { indice: 0, paginas: [{ numero: 1, texto: "p1" }] },
        { indice: 1, paginas: [{ numero: 2, texto: "p2" }] },
      ],
      banco: "galicia",
      motivo: "inicial",
    });

    expect(conectarMock).toHaveBeenCalled();
    expect(procesarChunksMock).toHaveBeenCalledOnce();
    // 2 onChunkOk * (1 push + 3 setSiNulo en el primero, 0 en el segundo)
    // + 1 set final = al menos 6 calls
    expect(updateOneMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    // Última call debe ser el set del estado final
    const calls = callsDe(updateOneMock);
    const lastSet = (calls[calls.length - 1]![1] as {
      $set?: { estado?: string };
    }).$set;
    expect(lastSet?.estado).toBe("extraido");
  });

  it("registra formato aprendido cuando hay perfil + huella + motivo inicial + extraido", async () => {
    procesarChunksMock.mockImplementation(async () => undefined);
    mockFindByIdLean({ _meta: { chunksFallidos: [] } });
    registrarFormatoMock.mockResolvedValue(new Types.ObjectId() as unknown as null);

    const perfilId = new Types.ObjectId();
    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [],
      banco: "santander",
      motivo: "inicial",
      huella: "abc",
      resumenHuella: "res",
      perfilId,
    });

    expect(registrarFormatoMock).toHaveBeenCalledOnce();
    const args = callsDe(registrarFormatoMock)[0]![0] as {
      huella: string;
      perfilId: Types.ObjectId;
    };
    expect(args.huella).toBe("abc");
    expect(args.perfilId).toBe(perfilId);
  });

  it("NO registra formato cuando motivo es 'reanudar'", async () => {
    procesarChunksMock.mockImplementation(async () => undefined);
    mockFindByIdLean({ _meta: { chunksFallidos: [] } });

    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [],
      banco: null,
      motivo: "reanudar",
      huella: "abc",
      perfilId: new Types.ObjectId(),
    });

    expect(registrarFormatoMock).not.toHaveBeenCalled();
  });

  it("estado final 'parcial' cuando hay chunks fallidos", async () => {
    procesarChunksMock.mockImplementation(async ({ onChunkFalla }) => {
      await onChunkFalla({
        indice: 0,
        paginas: [1],
        ms: 30,
        error: "openai timeout",
      });
    });
    mockFindByIdLean({
      _meta: { chunksFallidos: [{ indice: 0, paginas: [1], error: "openai timeout" }] },
    });

    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [{ indice: 0, paginas: [{ numero: 1, texto: "x" }] }],
      banco: null,
      motivo: "inicial",
    });

    const calls = callsDe(updateOneMock);
    const setEnd = (calls[calls.length - 1]![1] as {
      $set?: { estado?: string };
    }).$set;
    expect(setEnd?.estado).toBe("parcial");
  });

  it("registra error tras fallo catastrófico sin avance previo → estado 'error'", async () => {
    procesarChunksMock.mockRejectedValue(new Error("openai cayó"));
    mockFindByIdLean({ movimientos: [], _meta: { chunksOk: 0 } });

    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [{ indice: 0, paginas: [{ numero: 1, texto: "x" }] }],
      banco: null,
      motivo: "inicial",
    });

    const calls = callsDe(updateOneMock);
    const setObj = (calls[calls.length - 1]![1] as {
      $set?: { estado?: string; error?: string };
    }).$set;
    expect(setObj?.estado).toBe("error");
    expect(setObj?.error).toBe("openai cayó");
  });

  it("fallo catastrófico CON avance previo → estado 'parcial' sin error", async () => {
    procesarChunksMock.mockRejectedValue(new Error("crash"));
    mockFindByIdLean({
      movimientos: [{ fecha: "x", descripcion: "y" }],
      _meta: { chunksOk: 1 },
    });

    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [{ indice: 0, paginas: [{ numero: 1, texto: "x" }] }],
      banco: null,
      motivo: "inicial",
    });

    const calls = callsDe(updateOneMock);
    const setObj = (calls[calls.length - 1]![1] as {
      $set?: { estado?: string; error?: string | null };
    }).$set;
    expect(setObj?.estado).toBe("parcial");
    expect(setObj?.error).toBe(null);
  });

  it("cifra cuenta y titular antes de persistir", async () => {
    procesarChunksMock.mockImplementation(async ({ onChunkOk }) => {
      await onChunkOk({
        indice: 0,
        paginas: [1],
        resultado: {
          cuenta: "1234-5678",
          titular: "Juan",
          periodo: null,
          movimientos: [],
        },
        meta: { tokensInput: 0, tokensOutput: 0 },
        ms: 10,
      });
    });
    mockFindByIdLean({ _meta: { chunksFallidos: [] } });

    await correrExtraccion({
      extraccionId: new Types.ObjectId().toString(),
      chunks: [{ indice: 0, paginas: [{ numero: 1, texto: "x" }] }],
      banco: null,
      motivo: "inicial",
    });

    // Buscar el call de setSiNulo cuenta
    const callCuenta = callsDe(updateOneMock).find(
      (c) =>
        (c[1] as { $set?: { cuenta?: string } }).$set?.cuenta !== undefined,
    );
    expect(callCuenta).toBeTruthy();
    const valorCuenta = (callCuenta![1] as { $set: { cuenta: string } }).$set
      .cuenta;
    expect(valorCuenta.startsWith("enc:v1:")).toBe(true);
  });
});
