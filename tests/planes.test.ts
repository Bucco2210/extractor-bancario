import { describe, it, expect } from "vitest";
import {
  PLANES,
  TIPOS_PLAN,
  ORDEN_PLANES_VISIBLE,
  planExiste,
  calcularFinCiclo,
  duracionCicloMs,
  DIAS_TRIAL,
} from "../app/lib/planes";

describe("matriz de PLANES", () => {
  it("tiene los 4 planes esperados", () => {
    expect(TIPOS_PLAN).toEqual(["trial", "plus", "pro", "premium"]);
    for (const p of TIPOS_PLAN) {
      expect(PLANES[p]).toBeDefined();
      expect(PLANES[p].id).toBe(p);
    }
  });

  it("trial no tiene precio (no se vende)", () => {
    expect(PLANES.trial.precioUsd.mensual).toBe(null);
    expect(PLANES.trial.precioUsd.anual).toBe(null);
  });

  it("plus/pro/premium tienen precio en USD y anual = 10× mensual", () => {
    for (const p of ["plus", "pro", "premium"] as const) {
      const def = PLANES[p];
      expect(def.precioUsd.mensual).toBeGreaterThan(0);
      expect(def.precioUsd.anual).toBe(def.precioUsd.mensual! * 10);
    }
  });

  it("trial = 3 extracciones, sin conciliación", () => {
    expect(PLANES.trial.limiteExtraccionesPorCiclo).toBe(3);
    expect(PLANES.trial.limiteConciliacionesPorCiclo).toBe(0);
  });

  it("plus = 20 extracciones, sin conciliación", () => {
    expect(PLANES.plus.limiteExtraccionesPorCiclo).toBe(20);
    expect(PLANES.plus.limiteConciliacionesPorCiclo).toBe(0);
  });

  it("pro = 75 extracciones + 10 conciliaciones", () => {
    expect(PLANES.pro.limiteExtraccionesPorCiclo).toBe(75);
    expect(PLANES.pro.limiteConciliacionesPorCiclo).toBe(10);
  });

  it("premium = 250 extracciones + conciliación ilimitada", () => {
    expect(PLANES.premium.limiteExtraccionesPorCiclo).toBe(250);
    expect(PLANES.premium.limiteConciliacionesPorCiclo).toBe(Infinity);
  });

  it("orden visible no incluye trial (no se vende)", () => {
    expect(ORDEN_PLANES_VISIBLE).toEqual(["plus", "pro", "premium"]);
    expect(ORDEN_PLANES_VISIBLE).not.toContain("trial");
  });

  it("solo un plan marcado como recomendado", () => {
    const recomendados = ORDEN_PLANES_VISIBLE.filter(
      (p) => PLANES[p].recomendado,
    );
    expect(recomendados).toHaveLength(1);
  });
});

describe("planExiste", () => {
  it("acepta planes válidos", () => {
    expect(planExiste("plus")).toBe(true);
    expect(planExiste("trial")).toBe(true);
    expect(planExiste("premium")).toBe(true);
  });
  it("rechaza desconocidos", () => {
    expect(planExiste("enterprise")).toBe(false);
    expect(planExiste("")).toBe(false);
  });
});

describe("duracionCicloMs", () => {
  it("trial dura DIAS_TRIAL días", () => {
    expect(duracionCicloMs("trial", "mensual")).toBe(
      DIAS_TRIAL * 24 * 60 * 60 * 1000,
    );
  });

  it("planes pagos: mensual = 30 días, anual = 365 días", () => {
    expect(duracionCicloMs("plus", "mensual")).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
    expect(duracionCicloMs("pro", "anual")).toBe(
      365 * 24 * 60 * 60 * 1000,
    );
  });
});

describe("calcularFinCiclo", () => {
  it("suma la duración al inicio dado", () => {
    const inicio = new Date("2026-03-01T00:00:00Z");
    const finMensual = calcularFinCiclo("pro", "mensual", inicio);
    expect(finMensual.getTime() - inicio.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it("trial usa DIAS_TRIAL independiente del ciclo", () => {
    const inicio = new Date("2026-03-01T00:00:00Z");
    const finT1 = calcularFinCiclo("trial", "mensual", inicio);
    const finT2 = calcularFinCiclo("trial", "anual", inicio);
    expect(finT1.getTime()).toBe(finT2.getTime());
  });
});
