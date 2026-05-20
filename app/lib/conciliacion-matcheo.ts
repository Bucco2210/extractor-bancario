import levenshtein from "fast-levenshtein";
import type { RegistroSegundaFuente } from "./conciliacion-parser";

export type MovimientoExtracto = {
  idx: number;
  fecha: string | null; // DD/MM/YYYY
  descripcion: string;
  /** Monto neto = (credito ?? 0) - (debito ?? 0). El matcheo se hace
   *  por valor absoluto, así que el signo no importa para la decisión. */
  montoNeto: number | null;
};

export type Tolerancias = {
  dias: number;
  importe: number;
  fuzzyUmbral: number;
};

export type Match = {
  extractoIdx: number;
  registroIdx: number;
  score: number;
  criterios: { fecha: number; importe: number; descripcion: number };
};

export type ResultadoMatcheo = {
  matches: Match[];
  huerfanosExtracto: number[];
  huerfanosSegundaFuente: number[];
};

const PESO_FECHA = 0.4;
const PESO_IMPORTE = 0.3;
const PESO_DESCRIPCION = 0.3;

function parseFecha(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

export function diffDias(a: string | null, b: string | null): number | null {
  const da = parseFecha(a);
  const db = parseFecha(b);
  if (!da || !db) return null;
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
}

export function similitudDescripcion(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein.get(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

/**
 * Calcula el score de match entre un movimiento del extracto y un
 * registro de la segunda fuente. Devuelve `null` si no pasa las
 * tolerancias duras (fechas/importe muy distantes).
 */
export function scoreCandidato(
  extracto: MovimientoExtracto,
  registro: RegistroSegundaFuente,
  tol: Tolerancias,
): { score: number; criterios: Match["criterios"] } | null {
  if (extracto.montoNeto === null || registro.monto === null) return null;
  const diffImporte = Math.abs(
    Math.abs(extracto.montoNeto) - Math.abs(registro.monto),
  );
  if (diffImporte > tol.importe) return null;

  const dDias = diffDias(extracto.fecha, registro.fecha);
  if (dDias === null) return null;
  if (dDias > tol.dias) return null;

  const sFecha = tol.dias > 0 ? 1 - dDias / tol.dias : dDias === 0 ? 1 : 0;
  const sImporte =
    tol.importe > 0 ? 1 - diffImporte / tol.importe : diffImporte === 0 ? 1 : 0;
  const sDescripcion = similitudDescripcion(
    extracto.descripcion,
    registro.descripcion,
  );

  const score =
    PESO_FECHA * sFecha + PESO_IMPORTE * sImporte + PESO_DESCRIPCION * sDescripcion;

  return {
    score,
    criterios: {
      fecha: Number(sFecha.toFixed(3)),
      importe: Number(sImporte.toFixed(3)),
      descripcion: Number(sDescripcion.toFixed(3)),
    },
  };
}

/**
 * Matcheo greedy: arma todos los pares (extractoIdx, registroIdx) que
 * pasan las tolerancias, los ordena por score descendente y asigna
 * 1-a-1 reservando lo ya usado. Devuelve los matches que superan el
 * umbral fuzzy + los huérfanos de cada lado.
 *
 * Indexs descartados (`descartadosExtracto`) se excluyen del proceso y
 * tampoco aparecen en los huérfanos del extracto.
 */
export function matchear(input: {
  movimientos: MovimientoExtracto[];
  registros: RegistroSegundaFuente[];
  tolerancias: Tolerancias;
  descartadosExtracto?: number[];
}): ResultadoMatcheo {
  const descartados = new Set(input.descartadosExtracto ?? []);
  type Par = Match;
  const pares: Par[] = [];

  for (const m of input.movimientos) {
    if (descartados.has(m.idx)) continue;
    for (const r of input.registros) {
      const r2 = scoreCandidato(m, r, input.tolerancias);
      if (!r2) continue;
      if (r2.score < input.tolerancias.fuzzyUmbral) continue;
      pares.push({
        extractoIdx: m.idx,
        registroIdx: r.idx,
        score: r2.score,
        criterios: r2.criterios,
      });
    }
  }

  pares.sort((a, b) => b.score - a.score);

  const extractoUsado = new Set<number>();
  const registroUsado = new Set<number>();
  const matches: Match[] = [];
  for (const p of pares) {
    if (extractoUsado.has(p.extractoIdx)) continue;
    if (registroUsado.has(p.registroIdx)) continue;
    matches.push(p);
    extractoUsado.add(p.extractoIdx);
    registroUsado.add(p.registroIdx);
  }

  const huerfanosExtracto = input.movimientos
    .map((m) => m.idx)
    .filter((idx) => !descartados.has(idx) && !extractoUsado.has(idx));
  const huerfanosSegundaFuente = input.registros
    .map((r) => r.idx)
    .filter((idx) => !registroUsado.has(idx));

  return { matches, huerfanosExtracto, huerfanosSegundaFuente };
}

export type EstadisticasInput = {
  totalExtracto: number;
  totalSegundaFuente: number;
  matchesExtractoIdxs: number[];
  matchesRegistroIdxs: number[];
  descartadosExtracto: number[];
  gruposManuales: ReadonlyArray<{
    extractoIdxs: number[];
    registroIdxs: number[];
  }>;
};

export type Estadisticas = {
  totalExtracto: number;
  totalSegundaFuente: number;
  matcheados: number;
  huerfanosExtracto: number;
  huerfanosSegundaFuente: number;
  enGruposManuales: number;
};

/**
 * Calcula estadísticas de la conciliación contando huérfanos como el
 * total menos los que ya están asignados a algún match 1:1, descartados
 * o agrupados manualmente. Cualquier intersección entre estos sets se
 * descontaría doble, así que aplicamos uniones de Set antes de restar.
 */
export function calcularEstadisticas(input: EstadisticasInput): Estadisticas {
  const matchesExtracto = new Set(input.matchesExtractoIdxs);
  const matchesRegistro = new Set(input.matchesRegistroIdxs);
  const descartados = new Set(input.descartadosExtracto);
  const grupoExtracto = new Set<number>();
  const grupoRegistro = new Set<number>();
  for (const g of input.gruposManuales) {
    for (const i of g.extractoIdxs) grupoExtracto.add(i);
    for (const i of g.registroIdxs) grupoRegistro.add(i);
  }
  const ocupadosExtracto = new Set<number>([
    ...matchesExtracto,
    ...descartados,
    ...grupoExtracto,
  ]);
  const ocupadosRegistro = new Set<number>([
    ...matchesRegistro,
    ...grupoRegistro,
  ]);
  return {
    totalExtracto: input.totalExtracto,
    totalSegundaFuente: input.totalSegundaFuente,
    matcheados: matchesExtracto.size,
    huerfanosExtracto: Math.max(0, input.totalExtracto - ocupadosExtracto.size),
    huerfanosSegundaFuente: Math.max(
      0,
      input.totalSegundaFuente - ocupadosRegistro.size,
    ),
    enGruposManuales: grupoExtracto.size + grupoRegistro.size,
  };
}

/**
 * Convierte el array `movimientos` de una extracción al shape que
 * espera el matcheador.
 */
export function aMovimientosExtracto(
  movimientos: ReadonlyArray<{
    fecha?: string;
    descripcion?: string;
    debito?: number | null;
    credito?: number | null;
  }>,
): MovimientoExtracto[] {
  return movimientos.map((m, idx) => {
    const credito = m.credito ?? null;
    const debito = m.debito ?? null;
    return {
      idx,
      fecha: m.fecha || null,
      descripcion: m.descripcion ?? "",
      montoNeto:
        credito === null && debito === null ? null : (credito ?? 0) - (debito ?? 0),
    };
  });
}
