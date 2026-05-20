import { describe, it, expect } from "vitest";
import {
  perfilCreateSchema,
  perfilUpdateSchema,
  perfilListQuerySchema,
} from "../app/lib/perfiles-schema";

const perfilValido = {
  slug: "galicia_extracto_ars",
  entidad: { slug: "galicia", nombre: "Banco Galicia" },
  categoria: "banco" as const,
  nombre: "Extracto CA ARS",
  tipoDocumento: "extracto_bancario" as const,
  monedaPrimaria: "ARS" as const,
  huella: { palabrasClave: ["Banco Galicia"] },
};

describe("perfilCreateSchema", () => {
  it("acepta un perfil mínimo válido y completa defaults", () => {
    const r = perfilCreateSchema.safeParse(perfilValido);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.activo).toBe(true);
    expect(r.data.ordenEnGrid).toBe(100);
    expect(r.data.validacionesEspeciales).toEqual([]);
    expect(r.data.promptSistema).toBe("");
  });

  it("normaliza el slug a minúsculas y rechaza caracteres inválidos", () => {
    const r1 = perfilCreateSchema.safeParse({
      ...perfilValido,
      slug: "GALICIA_EXTRACTO",
    });
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.slug).toBe("galicia_extracto");

    const r2 = perfilCreateSchema.safeParse({
      ...perfilValido,
      slug: "galicia extracto", // espacio
    });
    expect(r2.success).toBe(false);
  });

  it("rechaza categorías y tipos fuera del enum", () => {
    const r1 = perfilCreateSchema.safeParse({
      ...perfilValido,
      categoria: "tarjeta",
    });
    expect(r1.success).toBe(false);

    const r2 = perfilCreateSchema.safeParse({
      ...perfilValido,
      tipoDocumento: "otra_cosa",
    });
    expect(r2.success).toBe(false);
  });

  it("rechaza monedaPrimaria fuera de ARS/USD", () => {
    const r = perfilCreateSchema.safeParse({
      ...perfilValido,
      monedaPrimaria: "EUR",
    });
    expect(r.success).toBe(false);
  });

  it("valida shape de validacionesEspeciales", () => {
    const ok = perfilCreateSchema.safeParse({
      ...perfilValido,
      validacionesEspeciales: [
        { tipo: "moneda_obligatoria", valor: "ARS", descripcion: null },
      ],
    });
    expect(ok.success).toBe(true);

    const fail = perfilCreateSchema.safeParse({
      ...perfilValido,
      validacionesEspeciales: [
        { tipo: "tipo_inventado", valor: "X" },
      ],
    });
    expect(fail.success).toBe(false);
  });
});

describe("perfilUpdateSchema", () => {
  it("rechaza body vacío", () => {
    const r = perfilUpdateSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("acepta updates parciales", () => {
    const r = perfilUpdateSchema.safeParse({ activo: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.activo).toBe(false);
  });
});

describe("perfilListQuerySchema", () => {
  it("coerce activo='true' a booleano", () => {
    const r = perfilListQuerySchema.safeParse({ activo: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.activo).toBe(true);
  });

  it("aplica default de límite", () => {
    const r = perfilListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limite).toBe(100);
  });

  it("acota el límite a 200", () => {
    const r = perfilListQuerySchema.safeParse({ limite: "9999" });
    expect(r.success).toBe(false);
  });
});
