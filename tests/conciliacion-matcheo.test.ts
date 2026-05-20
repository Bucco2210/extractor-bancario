import { describe, it, expect } from "vitest";
import {
  aMovimientosExtracto,
  calcularEstadisticas,
  diffDias,
  matchear,
  scoreCandidato,
  similitudDescripcion,
  type MovimientoExtracto,
  type Tolerancias,
} from "../app/lib/conciliacion-matcheo";
import type { RegistroSegundaFuente } from "../app/lib/conciliacion-parser";

const TOL: Tolerancias = { dias: 2, importe: 1, fuzzyUmbral: 0.8 };

function mov(over: Partial<MovimientoExtracto>): MovimientoExtracto {
  return {
    idx: 0,
    fecha: "01/03/2026",
    descripcion: "Pago ACME",
    montoNeto: 1000,
    ...over,
  };
}

function reg(over: Partial<RegistroSegundaFuente>): RegistroSegundaFuente {
  return {
    idx: 0,
    fecha: "01/03/2026",
    descripcion: "Pago ACME",
    monto: 1000,
    referencia: null,
    ...over,
  };
}

describe("diffDias / similitudDescripcion", () => {
  it("calcula diferencia en días", () => {
    expect(diffDias("01/03/2026", "03/03/2026")).toBe(2);
    expect(diffDias(null, "01/03/2026")).toBeNull();
  });
  it("similitud devuelve 1 entre strings iguales", () => {
    expect(similitudDescripcion("acme", "acme")).toBe(1);
    expect(similitudDescripcion("", "")).toBe(1);
    expect(similitudDescripcion("a", "")).toBe(0);
  });
});

describe("scoreCandidato", () => {
  it("descarta si supera tolerancia de importe", () => {
    expect(
      scoreCandidato(mov({ montoNeto: 1000 }), reg({ monto: 1500 }), TOL),
    ).toBeNull();
  });
  it("descarta si supera tolerancia de días", () => {
    expect(
      scoreCandidato(
        mov({ fecha: "01/03/2026" }),
        reg({ fecha: "10/03/2026" }),
        TOL,
      ),
    ).toBeNull();
  });
  it("compara importes por valor absoluto (signo distinto cuadra)", () => {
    const r = scoreCandidato(
      mov({ montoNeto: -1000 }),
      reg({ monto: 1000 }),
      TOL,
    );
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThan(0.9);
  });
});

describe("matchear", () => {
  it("hace pareo 1:1 greedy por score", () => {
    const movs: MovimientoExtracto[] = [
      mov({ idx: 0 }),
      mov({ idx: 1, descripcion: "Otra cosa" }),
    ];
    const regs: RegistroSegundaFuente[] = [
      reg({ idx: 0 }),
      reg({ idx: 1, descripcion: "Pago ACME" }),
    ];
    const r = matchear({ movimientos: movs, registros: regs, tolerancias: TOL });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]?.extractoIdx).toBe(0);
    expect(r.matches[0]?.registroIdx).toBe(0);
    expect(r.huerfanosExtracto).toContain(1);
    expect(r.huerfanosSegundaFuente).toContain(1);
  });

  it("excluye los descartados del extracto", () => {
    const movs: MovimientoExtracto[] = [mov({ idx: 0 }), mov({ idx: 1 })];
    const regs: RegistroSegundaFuente[] = [reg({ idx: 0 })];
    const r = matchear({
      movimientos: movs,
      registros: regs,
      tolerancias: TOL,
      descartadosExtracto: [0],
    });
    expect(r.matches[0]?.extractoIdx).toBe(1);
    expect(r.huerfanosExtracto).not.toContain(0);
  });
});

describe("aMovimientosExtracto", () => {
  it("calcula montoNeto = credito - debito", () => {
    const out = aMovimientosExtracto([
      { fecha: "01/03/2026", descripcion: "x", credito: 500, debito: null },
      { fecha: "02/03/2026", descripcion: "y", credito: null, debito: 200 },
      { fecha: "03/03/2026", descripcion: "z", credito: null, debito: null },
    ]);
    expect(out[0]?.montoNeto).toBe(500);
    expect(out[1]?.montoNeto).toBe(-200);
    expect(out[2]?.montoNeto).toBeNull();
  });
});

describe("calcularEstadisticas", () => {
  it("matcheados = idxs únicos del extracto en matches", () => {
    const e = calcularEstadisticas({
      totalExtracto: 10,
      totalSegundaFuente: 10,
      matchesExtractoIdxs: [0, 1, 2],
      matchesRegistroIdxs: [5, 6, 7],
      descartadosExtracto: [],
      gruposManuales: [],
    });
    expect(e.matcheados).toBe(3);
    expect(e.huerfanosExtracto).toBe(7);
    expect(e.huerfanosSegundaFuente).toBe(7);
    expect(e.enGruposManuales).toBe(0);
  });

  it("descontar descartados del huérfano-count del extracto", () => {
    const e = calcularEstadisticas({
      totalExtracto: 10,
      totalSegundaFuente: 5,
      matchesExtractoIdxs: [0, 1],
      matchesRegistroIdxs: [0, 1],
      descartadosExtracto: [2, 3, 4],
      gruposManuales: [],
    });
    expect(e.huerfanosExtracto).toBe(5);
  });

  it("descontar grupos manuales de ambos lados", () => {
    const e = calcularEstadisticas({
      totalExtracto: 10,
      totalSegundaFuente: 10,
      matchesExtractoIdxs: [0],
      matchesRegistroIdxs: [0],
      descartadosExtracto: [],
      gruposManuales: [
        { extractoIdxs: [1, 2], registroIdxs: [1, 2, 3] },
      ],
    });
    expect(e.huerfanosExtracto).toBe(10 - 1 - 2); // 7
    expect(e.huerfanosSegundaFuente).toBe(10 - 1 - 3); // 6
    expect(e.enGruposManuales).toBe(2 + 3);
  });

  it("no rompe si los sets se solapan por error de input", () => {
    const e = calcularEstadisticas({
      totalExtracto: 5,
      totalSegundaFuente: 5,
      matchesExtractoIdxs: [0, 1],
      matchesRegistroIdxs: [0, 1],
      descartadosExtracto: [1, 2], // 1 se solapa con match
      gruposManuales: [{ extractoIdxs: [2, 3], registroIdxs: [3, 4] }],
    });
    // Ocupados extracto = {0,1,2,3} → huérfanos = 1
    expect(e.huerfanosExtracto).toBe(1);
    // Ocupados registro = {0,1,3,4} → huérfanos = 1
    expect(e.huerfanosSegundaFuente).toBe(1);
  });
});
