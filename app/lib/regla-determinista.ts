import type { MovimientoExtraido } from "./openai";

export type ResultadoRegla = {
  movimientos: MovimientoExtraido[];
  lineasTotal: number;
  lineasPlausibles: number;
  lineasMatcheadas: number;
  /** Proporción de líneas plausibles que matchearon la regla. 0..1. */
  matchRate: number;
  /** Si compilar el regex tiró un error, queda acá. */
  errorCompilacion: string | null;
};

const GRUPOS_REQUERIDOS = ["fecha", "descripcion"] as const;
const GRUPOS_OPCIONALES = [
  "referencia",
  "debito",
  "credito",
  "saldo",
] as const;
export const GRUPOS_REGLA = [
  ...GRUPOS_REQUERIDOS,
  ...GRUPOS_OPCIONALES,
] as const;
export type GrupoRegla = (typeof GRUPOS_REGLA)[number];

/**
 * Heurística para decidir si una línea del PDF "parece" un movimiento.
 * Sirve para distinguir entre encabezados/leyendas (que la regla no va
 * a matchear, y está bien) y líneas que SÍ deberían matchear pero
 * fallaron (ahí la regla está rota).
 *
 * Una línea es "plausible" si contiene una fecha estilo dd/mm[/yy]
 * y al menos un número que pueda ser un monto.
 */
export function pareceMovimiento(linea: string): boolean {
  const tieneFecha = /\b\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?\b/.test(linea);
  const tieneMonto = /-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})/.test(linea);
  return tieneFecha && tieneMonto;
}

function aImporte(raw: string | undefined): number | null {
  if (!raw) return null;
  const limpio = raw.replace(/\s/g, "");
  if (!limpio || limpio === "-") return null;
  // formato AR común: 1.234.567,89 → 1234567.89
  // formato US: 1,234.56 → 1234.56
  // heurística: si tiene coma + algún punto antes, asumir AR.
  const tienePuntos = limpio.includes(".");
  const tieneComas = limpio.includes(",");
  let normalizado: string;
  if (tienePuntos && tieneComas) {
    // Si la coma viene después del último punto → AR
    if (limpio.lastIndexOf(",") > limpio.lastIndexOf(".")) {
      normalizado = limpio.replace(/\./g, "").replace(",", ".");
    } else {
      normalizado = limpio.replace(/,/g, "");
    }
  } else if (tieneComas) {
    // Solo comas: si hay exactamente una con 1-2 decimales, AR
    const match = /,(\d{1,2})$/.exec(limpio);
    normalizado = match ? limpio.replace(",", ".") : limpio.replace(/,/g, "");
  } else {
    normalizado = limpio;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function aFecha(raw: string | undefined): string {
  if (!raw) return "";
  const m = /^(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?$/.exec(raw.trim());
  if (!m) return raw.trim();
  const dd = m[1]!.padStart(2, "0");
  const mm = m[2]!.padStart(2, "0");
  let yyyy = m[3] ?? "";
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  if (!yyyy) yyyy = String(new Date().getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Aplica una regla regex al texto completo del PDF y devuelve los
 * movimientos extraídos. La regla debe ser un regex con grupos
 * nombrados — al menos `fecha` y `descripcion` son obligatorios.
 *
 * Se itera línea a línea: cada match es un movimiento. Las líneas que
 * no matchean se ignoran. Las líneas que "parecen movimientos"
 * (heurística pareceMovimiento) cuentan al denominador del matchRate.
 */
export function aplicarRegla(
  textoCompleto: string,
  reglaRegex: string,
): ResultadoRegla {
  let rx: RegExp;
  try {
    rx = new RegExp(reglaRegex);
  } catch (err) {
    return {
      movimientos: [],
      lineasTotal: 0,
      lineasPlausibles: 0,
      lineasMatcheadas: 0,
      matchRate: 0,
      errorCompilacion: err instanceof Error ? err.message : String(err),
    };
  }

  // Verificamos que el regex tenga al menos `fecha` y `descripcion`
  // como grupos nombrados, ejecutándolo contra un string mínimo y
  // mirando si la propiedad groups quedaría definida.
  // (No hay forma sin ejecutar el regex de inspeccionar los grupos
  // nombrados de manera nativa.)

  const lineas = textoCompleto.split(/\r?\n/);
  let plausibles = 0;
  let matcheadas = 0;
  const movimientos: MovimientoExtraido[] = [];

  for (const linea of lineas) {
    const trimmed = linea.trim();
    if (!trimmed) continue;
    const esPlausible = pareceMovimiento(trimmed);
    if (esPlausible) plausibles += 1;
    const m = rx.exec(trimmed);
    if (!m || !m.groups) continue;
    const g = m.groups as Partial<Record<GrupoRegla, string>>;
    if (!g.fecha || !g.descripcion) continue;
    matcheadas += 1;
    movimientos.push({
      fecha: aFecha(g.fecha),
      descripcion: g.descripcion.trim(),
      referencia: g.referencia ? g.referencia.trim() : null,
      debito: aImporte(g.debito),
      credito: aImporte(g.credito),
      saldo: aImporte(g.saldo),
    });
  }

  const matchRate = plausibles > 0 ? matcheadas / plausibles : 0;

  return {
    movimientos,
    lineasTotal: lineas.length,
    lineasPlausibles: plausibles,
    lineasMatcheadas: matcheadas,
    matchRate,
    errorCompilacion: null,
  };
}
