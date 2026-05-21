import { describe, it, expect } from "vitest";
import { serializarConciliacion } from "../app/lib/conciliaciones-serializer";

describe("serializarConciliacion", () => {
  const docCompleto = {
    _id: "c1",
    extraccionId: "e1",
    nombre: "conc test",
    estado: "completada",
    segundaFuente: {
      archivoNombre: "f.csv",
      formato: "csv",
      registros: [
        {
          idx: 0,
          fecha: "01/01/2026",
          descripcion: "cobro",
          monto: 100,
          referencia: "REF",
        },
      ],
      mapeoColumnas: {
        fecha: "Fecha",
        descripcion: "Descripcion",
        monto: "Monto",
        referencia: "Ref",
      },
      headersOriginales: ["Fecha", "Descripcion", "Monto", "Ref"],
    },
    tolerancias: { dias: 2, importe: 1, fuzzyUmbral: 0.85 },
    matches: [
      {
        extractoIdx: 0,
        registroIdx: 0,
        score: 0.9,
        criterios: { fecha: 1, importe: 1, descripcion: 0.7 },
        confirmadoManualmente: false,
      },
    ],
    descartadosExtracto: [3, 5],
    gruposManuales: [
      {
        extractoIdxs: [1, 2],
        registroIdxs: [4],
        nota: "n",
        creadoEn: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    estadisticas: {
      totalExtracto: 10,
      totalSegundaFuente: 8,
      matcheados: 5,
      huerfanosExtracto: 2,
      huerfanosSegundaFuente: 1,
      enGruposManuales: 3,
    },
    notas: "ok",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-02T10:00:00Z"),
  };

  it("serializa un doc completo manteniendo shape", () => {
    const r = serializarConciliacion(docCompleto);
    expect(r.id).toBe("c1");
    expect(r.extraccionId).toBe("e1");
    expect(r.nombre).toBe("conc test");
    expect(r.segundaFuente.registros).toHaveLength(1);
    expect(r.matches[0]!.criterios.fecha).toBe(1);
    expect(r.gruposManuales[0]!.creadoEn).toBe("2026-01-01T00:00:00.000Z");
    expect(r.estadisticas.matcheados).toBe(5);
    expect(r.descartadosExtracto).toEqual([3, 5]);
  });

  it("aplica defaults razonables a campos faltantes", () => {
    const docMinimo = {
      _id: "c2",
      extraccionId: "e2",
      nombre: "minimo",
      estado: "completada",
      segundaFuente: {
        archivoNombre: "x.csv",
        formato: "csv",
        mapeoColumnas: {},
        // registros, headersOriginales faltan
      },
      tolerancias: { dias: 0, importe: 0, fuzzyUmbral: 0 },
      // matches, descartadosExtracto, gruposManuales, estadisticas, notas faltan
    };
    const r = serializarConciliacion(docMinimo);
    expect(r.segundaFuente.registros).toEqual([]);
    expect(r.segundaFuente.headersOriginales).toEqual([]);
    expect(r.matches).toEqual([]);
    expect(r.descartadosExtracto).toEqual([]);
    expect(r.gruposManuales).toEqual([]);
    expect(r.estadisticas.matcheados).toBe(0);
    expect(r.notas).toBe("");
  });

  it("convierte creadoEn de string a ISO", () => {
    const doc = {
      ...docCompleto,
      gruposManuales: [
        {
          extractoIdxs: [0],
          registroIdxs: [0],
          nota: "",
          creadoEn: "2026-03-15T08:00:00.000Z",
        },
      ],
    };
    const r = serializarConciliacion(doc);
    expect(r.gruposManuales[0]!.creadoEn).toBe("2026-03-15T08:00:00.000Z");
  });

  it("criterios faltantes default a 0", () => {
    const doc = {
      ...docCompleto,
      matches: [
        {
          extractoIdx: 0,
          registroIdx: 0,
          score: 0.5,
          confirmadoManualmente: true,
        },
      ],
    };
    const r = serializarConciliacion(doc);
    expect(r.matches[0]!.criterios).toEqual({
      fecha: 0,
      importe: 0,
      descripcion: 0,
    });
  });
});
