import { createHash } from "node:crypto";

export const HUELLA_LINEAS_DEFAULT = 30;

/**
 * Normaliza una línea del PDF a su "esqueleto" estructural — el texto
 * sin los datos que cambian de un extracto al siguiente:
 *   - dígitos
 *   - fechas dd/mm/yyyy
 *   - montos con coma o punto decimal
 *   - espacios extra
 *
 * Resultado típico: "banco galicia s.a." (igual mes a mes).
 */
export function normalizarLineaParaHuella(linea: string): string {
  let s = linea.toLowerCase();
  // Fechas dd/mm/yyyy o dd-mm-yy
  s = s.replace(/\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/g, " ");
  // Montos con separadores: 1.234.567,89 o 1,234.56 o -1234.56
  s = s.replace(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g, " ");
  // Dígitos sueltos
  s = s.replace(/\d+/g, " ");
  // Cualquier secuencia de espacios → uno solo
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Toma el texto completo del PDF y devuelve las primeras N líneas
 * normalizadas, descartando líneas vacías. Esa es la base de la huella.
 */
export function tomarLineasParaHuella(
  textoCompleto: string,
  cantidad: number = HUELLA_LINEAS_DEFAULT,
): string[] {
  const lineas: string[] = [];
  for (const raw of textoCompleto.split(/\r?\n/)) {
    const norm = normalizarLineaParaHuella(raw);
    if (!norm) continue;
    lineas.push(norm);
    if (lineas.length >= cantidad) break;
  }
  return lineas;
}

/**
 * SHA-256 hex de las N líneas normalizadas concatenadas con "\n".
 * Misma huella para extractos del mismo formato con datos distintos;
 * distinta para bancos/productos distintos.
 */
export function calcularHuella(
  textoCompleto: string,
  cantidad: number = HUELLA_LINEAS_DEFAULT,
): { huella: string; resumen: string } {
  const lineas = tomarLineasParaHuella(textoCompleto, cantidad);
  const resumen = lineas.join("\n");
  const huella = createHash("sha256").update(resumen).digest("hex");
  return { huella, resumen };
}
