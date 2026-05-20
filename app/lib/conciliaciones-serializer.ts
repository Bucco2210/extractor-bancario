export type ConciliacionDTO = {
  id: string;
  extraccionId: string;
  nombre: string;
  estado: string;
  segundaFuente: {
    archivoNombre: string;
    formato: string;
    registros: Array<{
      idx: number;
      fecha: string | null;
      descripcion: string;
      monto: number | null;
      referencia: string | null;
    }>;
    mapeoColumnas: {
      fecha: string | null;
      descripcion: string | null;
      monto: string | null;
      referencia: string | null;
    };
    headersOriginales: string[];
  };
  tolerancias: { dias: number; importe: number; fuzzyUmbral: number };
  matches: Array<{
    extractoIdx: number;
    registroIdx: number;
    score: number;
    criterios: { fecha: number; importe: number; descripcion: number };
    confirmadoManualmente: boolean;
  }>;
  descartadosExtracto: number[];
  gruposManuales: Array<{
    extractoIdxs: number[];
    registroIdxs: number[];
    nota: string;
    creadoEn: string;
  }>;
  estadisticas: {
    totalExtracto: number;
    totalSegundaFuente: number;
    matcheados: number;
    huerfanosExtracto: number;
    huerfanosSegundaFuente: number;
    enGruposManuales: number;
  };
  notas: string;
  createdAt: string;
  updatedAt: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
// El tipado nativo de Mongoose para subdocs y `lean()` se vuelve
// complicado de propagar acá; aceptamos `any` adentro del serializador
// y la responsabilidad de calidad la deja en los handlers que validan
// entrada/salida con zod.
type Lean = any;

export function serializarConciliacion(doc: Lean): ConciliacionDTO {
  return {
    id: String(doc._id),
    extraccionId: String(doc.extraccionId),
    nombre: doc.nombre,
    estado: doc.estado,
    segundaFuente: {
      archivoNombre: doc.segundaFuente.archivoNombre,
      formato: doc.segundaFuente.formato,
      registros: (doc.segundaFuente.registros ?? []).map((r: any) => ({
        idx: r.idx,
        fecha: r.fecha ?? null,
        descripcion: r.descripcion ?? "",
        monto: r.monto ?? null,
        referencia: r.referencia ?? null,
      })),
      mapeoColumnas: {
        fecha: doc.segundaFuente.mapeoColumnas.fecha ?? null,
        descripcion: doc.segundaFuente.mapeoColumnas.descripcion ?? null,
        monto: doc.segundaFuente.mapeoColumnas.monto ?? null,
        referencia: doc.segundaFuente.mapeoColumnas.referencia ?? null,
      },
      headersOriginales: doc.segundaFuente.headersOriginales ?? [],
    },
    tolerancias: {
      dias: doc.tolerancias.dias,
      importe: doc.tolerancias.importe,
      fuzzyUmbral: doc.tolerancias.fuzzyUmbral,
    },
    matches: (doc.matches ?? []).map((m: any) => ({
      extractoIdx: m.extractoIdx,
      registroIdx: m.registroIdx,
      score: m.score,
      criterios: {
        fecha: m.criterios?.fecha ?? 0,
        importe: m.criterios?.importe ?? 0,
        descripcion: m.criterios?.descripcion ?? 0,
      },
      confirmadoManualmente: m.confirmadoManualmente,
    })),
    descartadosExtracto: doc.descartadosExtracto ?? [],
    gruposManuales: (doc.gruposManuales ?? []).map((g: any) => ({
      extractoIdxs: [...(g.extractoIdxs ?? [])],
      registroIdxs: [...(g.registroIdxs ?? [])],
      nota: g.nota ?? "",
      creadoEn: (g.creadoEn ?? new Date()).toISOString
        ? (g.creadoEn ?? new Date()).toISOString()
        : new Date(g.creadoEn ?? Date.now()).toISOString(),
    })),
    estadisticas: {
      totalExtracto: doc.estadisticas?.totalExtracto ?? 0,
      totalSegundaFuente: doc.estadisticas?.totalSegundaFuente ?? 0,
      matcheados: doc.estadisticas?.matcheados ?? 0,
      huerfanosExtracto: doc.estadisticas?.huerfanosExtracto ?? 0,
      huerfanosSegundaFuente: doc.estadisticas?.huerfanosSegundaFuente ?? 0,
      enGruposManuales: doc.estadisticas?.enGruposManuales ?? 0,
    },
    notas: doc.notas ?? "",
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}
