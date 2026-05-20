import ExcelJS from "exceljs";
import type { FormatoSegundaFuente } from "@/models/Conciliacion";

export type RegistroSegundaFuente = {
  idx: number;
  fecha: string | null;
  descripcion: string;
  monto: number | null;
  referencia: string | null;
};

export type MapeoColumnas = {
  fecha: string | null;
  descripcion: string | null;
  monto: string | null;
  referencia: string | null;
};

export type SegundaFuenteParseada = {
  formato: FormatoSegundaFuente;
  registros: RegistroSegundaFuente[];
  mapeoColumnas: MapeoColumnas;
  headers: string[];
};

export type ResultadoParseo =
  | { ok: true; data: SegundaFuenteParseada }
  | {
      ok: false;
      razon: "mapeo_incompleto";
      headers: string[];
      camposFaltantes: Array<"fecha" | "descripcion" | "monto">;
      filas: Array<Record<string, string>>;
    };

const NORMALIZAR_HEADER_REGEX = /[^a-z0-9]+/g;

function normalizarHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(NORMALIZAR_HEADER_REGEX, "");
}

const SINONIMOS: Record<keyof MapeoColumnas, string[]> = {
  fecha: ["fecha", "date", "fec", "fechamov", "fechaoperacion", "fechaop", "dia"],
  descripcion: [
    "descripcion",
    "detalle",
    "concepto",
    "description",
    "desc",
    "operacion",
    "glosa",
    "memo",
  ],
  monto: [
    "monto",
    "importe",
    "amount",
    "valor",
    "total",
    "montoars",
    "importeneto",
  ],
  referencia: ["referencia", "ref", "reference", "numero", "comprobante", "id"],
};

export function detectarMapeo(headers: string[]): MapeoColumnas {
  const normalizados = headers.map((h) => ({
    original: h,
    norm: normalizarHeader(h),
  }));
  const mapeo: MapeoColumnas = {
    fecha: null,
    descripcion: null,
    monto: null,
    referencia: null,
  };
  for (const campo of Object.keys(SINONIMOS) as Array<keyof MapeoColumnas>) {
    const sin = SINONIMOS[campo];
    for (const cand of normalizados) {
      if (sin.some((s) => cand.norm === s)) {
        mapeo[campo] = cand.original;
        break;
      }
    }
    if (mapeo[campo]) continue;
    // Fallback: includes (más laxo).
    for (const cand of normalizados) {
      if (sin.some((s) => cand.norm.includes(s))) {
        mapeo[campo] = cand.original;
        break;
      }
    }
  }
  return mapeo;
}

/* === CSV parser minimalista ============================================ */

/**
 * Parsea CSV con separador `,` o `;` (autodetectado por la primera línea
 * con headers). Soporta campos entre comillas dobles y escape `""`.
 * Suficiente para los exports típicos de bancos / contabilidad AR.
 */
export function parsearCSV(texto: string): {
  headers: string[];
  filas: string[][];
} {
  const normalizado = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // Detectar separador en la primera línea no vacía.
  const primeraLinea = normalizado.split("\n").find((l) => l.trim().length > 0);
  const sep =
    primeraLinea && primeraLinea.split(";").length > primeraLinea.split(",").length
      ? ";"
      : ",";

  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let dentroDeQuote = false;

  for (let i = 0; i < normalizado.length; i++) {
    const c = normalizado[i]!;
    if (dentroDeQuote) {
      if (c === '"') {
        if (normalizado[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeQuote = false;
        }
      } else {
        campo += c;
      }
    } else {
      if (c === '"') {
        dentroDeQuote = true;
      } else if (c === sep) {
        fila.push(campo);
        campo = "";
      } else if (c === "\n") {
        fila.push(campo);
        campo = "";
        if (fila.some((f) => f.length > 0)) filas.push(fila);
        fila = [];
      } else {
        campo += c;
      }
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    if (fila.some((f) => f.length > 0)) filas.push(fila);
  }

  const headers = filas.shift() ?? [];
  return { headers: headers.map((h) => h.trim()), filas };
}

/* === Importe parser ================================================== */

export function parsearImporte(raw: string | undefined | null): number | null {
  if (raw === null || raw === undefined) return null;
  const limpio = String(raw).trim().replace(/\s/g, "");
  if (!limpio || limpio === "-") return null;
  const tienePuntos = limpio.includes(".");
  const tieneComas = limpio.includes(",");
  let normalizado: string;
  if (tienePuntos && tieneComas) {
    if (limpio.lastIndexOf(",") > limpio.lastIndexOf(".")) {
      normalizado = limpio.replace(/\./g, "").replace(",", ".");
    } else {
      normalizado = limpio.replace(/,/g, "");
    }
  } else if (tieneComas) {
    const m = /,(\d{1,2})$/.exec(limpio);
    normalizado = m ? limpio.replace(",", ".") : limpio.replace(/,/g, "");
  } else {
    normalizado = limpio;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/* === Fecha parser ===================================================== */

export function parsearFecha(raw: string | undefined | null): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // DD/MM/YYYY o DD-MM-YYYY (con 2 o 4 dígitos de año)
  let m = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/.exec(s);
  if (m) {
    const dd = m[1]!.padStart(2, "0");
    const mm = m[2]!.padStart(2, "0");
    let yyyy = m[3] ?? "";
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    if (!yyyy) yyyy = String(new Date().getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }
  // YYYY-MM-DD ISO
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const yyyy = m[1]!;
    const mm = m[2]!.padStart(2, "0");
    const dd = m[3]!.padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }
  return null;
}

/* === Pipeline principal ============================================== */

function camposFaltantes(
  mapeo: MapeoColumnas,
): Array<"fecha" | "descripcion" | "monto"> {
  const out: Array<"fecha" | "descripcion" | "monto"> = [];
  if (!mapeo.fecha) out.push("fecha");
  if (!mapeo.descripcion) out.push("descripcion");
  if (!mapeo.monto) out.push("monto");
  return out;
}

function filaAObjeto(
  headers: string[],
  fila: string[],
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]!] = fila[i] ?? "";
  }
  return obj;
}

export function aplicarMapeo(
  headers: string[],
  filas: Array<Record<string, string>>,
  mapeo: MapeoColumnas,
): RegistroSegundaFuente[] {
  const out: RegistroSegundaFuente[] = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i]!;
    const fecha = mapeo.fecha ? parsearFecha(f[mapeo.fecha]) : null;
    const descripcion = mapeo.descripcion ? (f[mapeo.descripcion] ?? "").trim() : "";
    const monto = mapeo.monto ? parsearImporte(f[mapeo.monto]) : null;
    const referencia = mapeo.referencia ? (f[mapeo.referencia] ?? "").trim() : "";
    // Saltea filas totalmente vacías.
    if (!fecha && !descripcion && monto === null) continue;
    out.push({
      idx: out.length,
      fecha,
      descripcion,
      monto,
      referencia: referencia || null,
    });
  }
  return out;
}

export async function parsearSegundaFuente(input: {
  buffer: Buffer;
  nombreArchivo: string;
  mapeoOverride?: MapeoColumnas;
}): Promise<ResultadoParseo> {
  const formato: FormatoSegundaFuente = input.nombreArchivo
    .toLowerCase()
    .endsWith(".xlsx")
    ? "xlsx"
    : "csv";

  let headers: string[];
  let filasObj: Array<Record<string, string>>;

  if (formato === "csv") {
    const texto = input.buffer.toString("utf8");
    const { headers: h, filas } = parsearCSV(texto);
    headers = h;
    filasObj = filas.map((f) => filaAObjeto(headers, f));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(input.buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      return {
        ok: false,
        razon: "mapeo_incompleto",
        headers: [],
        camposFaltantes: ["fecha", "descripcion", "monto"],
        filas: [],
      };
    }
    const headerRow = sheet.getRow(1);
    headers = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? "").trim();
    });
    filasObj = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const cell = row.getCell(idx + 1);
        obj[h] = cell.value === null || cell.value === undefined
          ? ""
          : String(cell.value);
      });
      filasObj.push(obj);
    });
  }

  const mapeo = input.mapeoOverride ?? detectarMapeo(headers);
  const faltantes = camposFaltantes(mapeo);
  if (faltantes.length > 0) {
    return {
      ok: false,
      razon: "mapeo_incompleto",
      headers,
      camposFaltantes: faltantes,
      filas: filasObj.slice(0, 5),
    };
  }
  const registros = aplicarMapeo(headers, filasObj, mapeo);
  return {
    ok: true,
    data: { formato, registros, mapeoColumnas: mapeo, headers },
  };
}
