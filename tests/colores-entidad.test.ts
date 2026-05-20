import { describe, it, expect } from "vitest";
import { paletaDeEntidad, inicialesDeEntidad } from "../app/lib/colores-entidad";

describe("paletaDeEntidad", () => {
  it("es determinístico: mismo slug → misma paleta", () => {
    const a = paletaDeEntidad("galicia");
    const b = paletaDeEntidad("galicia");
    expect(a).toEqual(b);
  });

  it("siempre devuelve un par bg+text válido", () => {
    for (const slug of [
      "x",
      "galicia",
      "mercado_pago",
      "muy_largo_y_extranio",
    ]) {
      const r = paletaDeEntidad(slug);
      expect(r.bg).toMatch(/^bg-/);
      expect(r.text).toMatch(/^text-/);
    }
  });
});

describe("inicialesDeEntidad", () => {
  it("devuelve dos letras para nombres compuestos", () => {
    expect(inicialesDeEntidad("Banco Galicia")).toBe("BG");
    expect(inicialesDeEntidad("Mercado Pago")).toBe("MP");
  });

  it("devuelve dos letras para una sola palabra", () => {
    expect(inicialesDeEntidad("Ualá")).toBe("UA");
    expect(inicialesDeEntidad("X")).toBe("X");
  });

  it("filtra caracteres raros", () => {
    expect(inicialesDeEntidad("***---")).toBe("?");
  });
});
