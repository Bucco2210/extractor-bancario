import { describe, it, expect } from "vitest";
import { parsearRespuestaOpenAI } from "../app/lib/openai";

describe("parsearRespuestaOpenAI", () => {
  it("parsea una respuesta bien formada", () => {
    const raw = JSON.stringify({
      cuenta: "1234-5/6",
      periodo: "10/2025",
      titular: "Juan Pérez",
      movimientos: [
        {
          fecha: "01/10/2025",
          descripcion: "Pago tarjeta",
          referencia: "abc",
          debito: 1500.5,
          credito: null,
          saldo: 12345.67,
        },
      ],
    });
    const r = parsearRespuestaOpenAI(raw);
    expect(r.cuenta).toBe("1234-5/6");
    expect(r.movimientos).toHaveLength(1);
    expect(r.movimientos[0]?.debito).toBe(1500.5);
    expect(r.movimientos[0]?.credito).toBeNull();
  });

  it("devuelve estructura vacía si raw es vacío", () => {
    const r = parsearRespuestaOpenAI("");
    expect(r.movimientos).toEqual([]);
    expect(r.cuenta).toBeNull();
  });

  it("rechaza JSON inválido", () => {
    expect(() => parsearRespuestaOpenAI("{no json")).toThrow();
  });

  it("normaliza tipos malformados a null y filtra basura", () => {
    const raw = JSON.stringify({
      cuenta: 999,
      movimientos: [
        { fecha: "01/01/2025", descripcion: "ok", debito: "no-numero" },
        { fecha: "02/01/2025", descripcion: "ok2", credito: 200 },
      ],
    });
    const r = parsearRespuestaOpenAI(raw);
    expect(r.cuenta).toBeNull();
    expect(r.movimientos).toHaveLength(2);
    expect(r.movimientos[0]?.debito).toBeNull();
    expect(r.movimientos[1]?.credito).toBe(200);
  });
});
