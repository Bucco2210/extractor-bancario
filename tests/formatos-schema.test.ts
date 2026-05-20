import { describe, it, expect } from "vitest";
import {
  formatoUpdateSchema,
  formatoListQuerySchema,
  formatoProbarBodySchema,
} from "../app/lib/formatos-schema";

describe("formatoUpdateSchema", () => {
  it("acepta updates parciales", () => {
    expect(formatoUpdateSchema.safeParse({ reglaActiva: true }).success).toBe(
      true,
    );
    expect(
      formatoUpdateSchema.safeParse({ notas: "una nota" }).success,
    ).toBe(true);
  });

  it("rechaza body vacío", () => {
    expect(formatoUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("permite reglaRegex null para limpiar", () => {
    expect(
      formatoUpdateSchema.safeParse({ reglaRegex: null }).success,
    ).toBe(true);
  });
});

describe("formatoListQuerySchema", () => {
  it("coerce reglaActiva='true' a booleano", () => {
    const r = formatoListQuerySchema.safeParse({ reglaActiva: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reglaActiva).toBe(true);
  });

  it("aplica default limite=100", () => {
    const r = formatoListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limite).toBe(100);
  });

  it("valida entidad como slug", () => {
    expect(
      formatoListQuerySchema.safeParse({ entidad: "Banco Galicia!" }).success,
    ).toBe(false);
    expect(
      formatoListQuerySchema.safeParse({ entidad: "galicia" }).success,
    ).toBe(true);
  });
});

describe("formatoProbarBodySchema", () => {
  it("requiere texto largo", () => {
    expect(formatoProbarBodySchema.safeParse({ texto: "corto" }).success).toBe(
      false,
    );
    expect(
      formatoProbarBodySchema.safeParse({ texto: "x".repeat(50) }).success,
    ).toBe(true);
  });
});
