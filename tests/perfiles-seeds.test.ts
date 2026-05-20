import { describe, it, expect } from "vitest";
import { PERFILES_SEED } from "../app/lib/seeds/perfiles";
import { perfilCreateSchema } from "../app/lib/perfiles-schema";

describe("PERFILES_SEED", () => {
  it("trae exactamente 17 entidades", () => {
    expect(PERFILES_SEED).toHaveLength(17);
  });

  it("tiene un único slug por perfil", () => {
    const slugs = PERFILES_SEED.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("tiene un único entidad.slug (un perfil seed por entidad)", () => {
    const slugsEnt = PERFILES_SEED.map((p) => p.entidad.slug);
    expect(new Set(slugsEnt).size).toBe(slugsEnt.length);
  });

  it("se divide en bancos + billeteras (sin otras categorías)", () => {
    const cats = new Set(PERFILES_SEED.map((p) => p.categoria));
    expect(cats).toEqual(new Set(["banco", "billetera"]));
  });

  it("12 bancos + 5 billeteras", () => {
    const bancos = PERFILES_SEED.filter((p) => p.categoria === "banco");
    const billeteras = PERFILES_SEED.filter((p) => p.categoria === "billetera");
    expect(bancos).toHaveLength(12);
    expect(billeteras).toHaveLength(5);
  });

  it("cada seed valida contra el schema zod", () => {
    for (const seed of PERFILES_SEED) {
      const r = perfilCreateSchema.safeParse(seed);
      if (!r.success) {
        const detalle = r.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw new Error(`seed ${seed.slug} inválida: ${detalle}`);
      }
    }
  });

  it("cada seed tiene al menos una palabra clave para el detector", () => {
    for (const seed of PERFILES_SEED) {
      expect(seed.huella.palabrasClave.length).toBeGreaterThan(0);
    }
  });
});
