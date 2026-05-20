import { describe, it, expect } from "vitest";
import {
  definirChunks,
  ejecutarConPool,
  partirEnChunks,
} from "../app/lib/openai";

describe("partirEnChunks", () => {
  it("agrupa páginas en bloques del tamaño dado", () => {
    const paginas = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      numero: n,
      texto: `p${n}`,
    }));
    const chunks = partirEnChunks(paginas, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(chunks[1]!.map((p) => p.numero)).toEqual([4, 5, 6]);
    expect(chunks[2]!.map((p) => p.numero)).toEqual([7]);
  });

  it("devuelve [] si no hay páginas", () => {
    expect(partirEnChunks([], 6)).toEqual([]);
  });

  it("rechaza tamaño <= 0", () => {
    expect(() => partirEnChunks([], 0)).toThrow();
    expect(() => partirEnChunks([], -1)).toThrow();
  });

  it("un solo chunk cuando el total cabe", () => {
    const paginas = [1, 2, 3].map((n) => ({ numero: n, texto: "x" }));
    expect(partirEnChunks(paginas, 10)).toHaveLength(1);
  });
});

describe("definirChunks", () => {
  it("numera los chunks empezando en 0 y respeta el orden de páginas", () => {
    const paginas = [1, 2, 3, 4, 5].map((n) => ({ numero: n, texto: `p${n}` }));
    const chunks = definirChunks(paginas, 2);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({
      indice: 0,
      paginas: [
        { numero: 1, texto: "p1" },
        { numero: 2, texto: "p2" },
      ],
    });
    expect(chunks[2]?.indice).toBe(2);
    expect(chunks[2]?.paginas).toEqual([{ numero: 5, texto: "p5" }]);
  });

  it("devuelve [] sin páginas", () => {
    expect(definirChunks([], 6)).toEqual([]);
  });
});

describe("ejecutarConPool", () => {
  it("respeta la concurrencia máxima", async () => {
    let activas = 0;
    let pico = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await ejecutarConPool(items, 3, async () => {
      activas++;
      pico = Math.max(pico, activas);
      await new Promise((r) => setTimeout(r, 10));
      activas--;
    });
    expect(pico).toBeLessThanOrEqual(3);
  });

  it("procesa todos los items", async () => {
    const procesados: number[] = [];
    await ejecutarConPool([10, 20, 30, 40, 50], 2, async (n) => {
      procesados.push(n);
    });
    expect(procesados.sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
  });

  it("no rompe con array vacío", async () => {
    await expect(ejecutarConPool([], 3, async () => {})).resolves.toBeUndefined();
  });

  it("propaga errores del worker", async () => {
    await expect(
      ejecutarConPool([1], 1, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
