import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del cliente Inngest antes de importar `dispararExtraccion`.
// `vi.hoisted` garantiza que el mock se construya antes de los imports.
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(async () => ({ ids: ["evt_test_1"] })),
}));

vi.mock("inngest", () => ({
  Inngest: class {
    send = mockSend;
    createFunction = (): { id: string } => ({ id: "mock-fn" });
  },
}));

import { dispararExtraccion } from "../app/lib/inngest";

describe("dispararExtraccion", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  it("emite un evento `extraccion.procesar` con el shape esperado", async () => {
    await dispararExtraccion({
      extraccionId: "ext-1",
      chunks: [
        { indice: 0, paginas: [{ numero: 1, texto: "hola" }] },
      ],
      banco: "galicia",
      motivo: "inicial",
      huella: "abc123",
      resumenHuella: "resumen",
      perfilId: "perf-1",
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const calls = mockSend.mock.calls as unknown as Array<[unknown]>;
    const arg = calls[0]![0] as {
      name: string;
      data: { extraccionId: string; motivo: string };
    };
    expect(arg.name).toBe("extraccion.procesar");
    expect(arg.data.extraccionId).toBe("ext-1");
    expect(arg.data.motivo).toBe("inicial");
  });

  it("soporta motivo 'reanudar' con perfilId/huella en null", async () => {
    await dispararExtraccion({
      extraccionId: "ext-2",
      chunks: [],
      banco: null,
      motivo: "reanudar",
      huella: null,
      resumenHuella: null,
      perfilId: null,
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const calls = mockSend.mock.calls as unknown as Array<[unknown]>;
    const arg = calls[0]![0] as {
      data: { motivo: string; perfilId: string | null };
    };
    expect(arg.data.motivo).toBe("reanudar");
    expect(arg.data.perfilId).toBe(null);
  });

  it("propaga errores del cliente Inngest", async () => {
    mockSend.mockRejectedValueOnce(new Error("inngest network down"));
    await expect(
      dispararExtraccion({
        extraccionId: "ext-3",
        chunks: [],
        banco: null,
        motivo: "inicial",
        huella: null,
        resumenHuella: null,
        perfilId: null,
      }),
    ).rejects.toThrow(/inngest network down/);
  });
});
