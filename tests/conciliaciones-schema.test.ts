import { describe, it, expect } from "vitest";
import {
  conciliacionListQuerySchema,
  tolerancesSchema,
  mapeoColumnasSchema,
  conciliacionPatchSchema,
} from "../app/lib/conciliaciones-schema";

const OID_VALIDO = "507f1f77bcf86cd799439011";

describe("conciliacionListQuerySchema", () => {
  it("acepta query vacía con defaults", () => {
    const r = conciliacionListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limite).toBe(50);
  });

  it("coerce limite de string a number", () => {
    const r = conciliacionListQuerySchema.parse({ limite: "10" });
    expect(r.limite).toBe(10);
  });

  it("rechaza extraccionId que no es ObjectId", () => {
    const r = conciliacionListQuerySchema.safeParse({ extraccionId: "x" });
    expect(r.success).toBe(false);
  });

  it("acepta extraccionId válido", () => {
    const r = conciliacionListQuerySchema.parse({ extraccionId: OID_VALIDO });
    expect(r.extraccionId).toBe(OID_VALIDO);
  });

  it("clampa limite a max 100", () => {
    const r = conciliacionListQuerySchema.safeParse({ limite: 500 });
    expect(r.success).toBe(false);
  });
});

describe("tolerancesSchema", () => {
  it("acepta valores válidos", () => {
    const r = tolerancesSchema.parse({ dias: 2, importe: 1, fuzzyUmbral: 0.8 });
    expect(r.dias).toBe(2);
  });

  it("rechaza fuzzyUmbral fuera de [0, 1]", () => {
    expect(tolerancesSchema.safeParse({ dias: 1, importe: 1, fuzzyUmbral: 1.5 })
      .success).toBe(false);
  });

  it("rechaza dias negativo", () => {
    expect(tolerancesSchema.safeParse({ dias: -1, importe: 1, fuzzyUmbral: 0.5 })
      .success).toBe(false);
  });
});

describe("mapeoColumnasSchema", () => {
  it("acepta strings o null para fecha/descripcion/monto", () => {
    const r = mapeoColumnasSchema.parse({
      fecha: "Fecha",
      descripcion: "Descripcion",
      monto: "Monto",
    });
    expect(r.fecha).toBe("Fecha");
    expect(r.referencia).toBe(null);
  });
});

describe("conciliacionPatchSchema", () => {
  it("requiere al menos un cambio (body vacío falla)", () => {
    expect(conciliacionPatchSchema.safeParse({}).success).toBe(false);
  });

  it("acepta solo nombre", () => {
    const r = conciliacionPatchSchema.parse({ nombre: "Nuevo" });
    expect(r.nombre).toBe("Nuevo");
  });

  it("acepta forzarMatch", () => {
    const r = conciliacionPatchSchema.parse({
      forzarMatch: { extractoIdx: 0, registroIdx: 1 },
    });
    expect(r.forzarMatch?.extractoIdx).toBe(0);
  });

  it("acepta crearGrupoManual con un mov y un registro", () => {
    const r = conciliacionPatchSchema.parse({
      crearGrupoManual: {
        extractoIdxs: [0, 1],
        registroIdxs: [3],
      },
    });
    expect(r.crearGrupoManual?.nota).toBe("");
  });

  it("rechaza crearGrupoManual con índices duplicados", () => {
    const r = conciliacionPatchSchema.safeParse({
      crearGrupoManual: {
        extractoIdxs: [0, 0],
        registroIdxs: [1],
      },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza crearGrupoManual con ambos lados vacíos", () => {
    expect(
      conciliacionPatchSchema.safeParse({
        crearGrupoManual: { extractoIdxs: [], registroIdxs: [] },
      }).success,
    ).toBe(false);
  });

  it("acepta reMatchear: true", () => {
    const r = conciliacionPatchSchema.parse({ reMatchear: true });
    expect(r.reMatchear).toBe(true);
  });

  it("acepta descartarExtracto con descartar=true", () => {
    const r = conciliacionPatchSchema.parse({
      descartarExtracto: { extractoIdx: 5, descartar: true },
    });
    expect(r.descartarExtracto?.extractoIdx).toBe(5);
  });

  it("acepta eliminarGrupoManual", () => {
    const r = conciliacionPatchSchema.parse({
      eliminarGrupoManual: { indice: 2 },
    });
    expect(r.eliminarGrupoManual?.indice).toBe(2);
  });

  it("acepta quitarMatch", () => {
    const r = conciliacionPatchSchema.parse({
      quitarMatch: { extractoIdx: 0 },
    });
    expect(r.quitarMatch?.extractoIdx).toBe(0);
  });

  it("acepta tolerancias custom", () => {
    const r = conciliacionPatchSchema.parse({
      tolerancias: { dias: 5, importe: 10, fuzzyUmbral: 0.9 },
    });
    expect(r.tolerancias?.dias).toBe(5);
  });
});
