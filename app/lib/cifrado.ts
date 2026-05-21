import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Cifrado simétrico AES-256-GCM para campos sensibles en reposo.
 *
 * Formato del ciphertext: `enc:v1:<iv_base64>:<tag_base64>:<data_base64>`.
 * El prefijo `enc:v1:` cumple dos funciones:
 *   1. Detectar idempotencia (no doble-cifrar valores ya cifrados).
 *   2. Permitir versionar el algoritmo si en el futuro hace falta rotación.
 *
 * Clave: 32 bytes derivados de `APP_ENCRYPTION_KEY` (validado como 64 hex
 * chars en `app/lib/env.ts`). IV: 12 bytes aleatorios por cifrado (GCM).
 */

const PREFIJO = "enc:v1:";
const ALGORITMO = "aes-256-gcm";
const LARGO_IV = 12;

let claveCache: Buffer | null = null;
function claveAES(): Buffer {
  if (!claveCache) {
    claveCache = Buffer.from(env.APP_ENCRYPTION_KEY, "hex");
    if (claveCache.length !== 32) {
      throw new Error("APP_ENCRYPTION_KEY debe decodificar a 32 bytes");
    }
  }
  return claveCache;
}

/** Solo para tests: limpia el cache de la clave (usar tras cambiar process.env). */
export function __resetCifradoCache(): void {
  claveCache = null;
}

export function esCifrado(valor: unknown): valor is string {
  return typeof valor === "string" && valor.startsWith(PREFIJO);
}

/**
 * Cifra un string. Idempotente: si ya está cifrado lo devuelve igual.
 * Acepta null/undefined/empty y los devuelve sin tocar (no tiene sentido
 * cifrar la ausencia de dato, y mantiene la semántica del campo opcional).
 */
export function cifrar<T extends string | null | undefined>(plaintext: T): T {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (plaintext === "") return plaintext;
  if (esCifrado(plaintext)) return plaintext;
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, claveAES(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext as string, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIJO}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString(
    "base64",
  )}` as T;
}

/**
 * Descifra un string. Idempotente al revés: si no está cifrado (legacy
 * plaintext o vacío) lo devuelve tal cual. Si está cifrado pero corrupto o
 * con tag inválido, propaga el error de GCM (tampering detection).
 */
export function descifrar<T extends string | null | undefined>(ciphertext: T): T {
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  if (ciphertext === "") return ciphertext;
  if (!esCifrado(ciphertext)) return ciphertext;
  const partes = (ciphertext as string).slice(PREFIJO.length).split(":");
  if (partes.length !== 3) {
    throw new Error("Formato de cifrado inválido (se esperan 3 partes)");
  }
  const [ivB64, tagB64, dataB64] = partes;
  const iv = Buffer.from(ivB64!, "base64");
  const tag = Buffer.from(tagB64!, "base64");
  const data = Buffer.from(dataB64!, "base64");
  const decipher = createDecipheriv(ALGORITMO, claveAES(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8") as T;
}

// ============================================================================
// Helpers de dominio: aplican a estructuras conocidas del proyecto.
// ============================================================================

export type MovimientoCifrable = {
  fecha?: string;
  descripcion?: string | null;
  referencia?: string | null;
  debito?: number | null;
  credito?: number | null;
  saldo?: number | null;
};

/** Devuelve una copia del movimiento con descripcion/referencia cifrados. */
export function cifrarMovimiento<T extends MovimientoCifrable>(m: T): T {
  return {
    ...m,
    descripcion: cifrar(m.descripcion),
    referencia: cifrar(m.referencia),
  };
}

export function descifrarMovimiento<T extends MovimientoCifrable>(m: T): T {
  return {
    ...m,
    descripcion: descifrar(m.descripcion),
    referencia: descifrar(m.referencia),
  };
}

export function cifrarMovimientos<T extends MovimientoCifrable>(arr: T[]): T[] {
  return arr.map(cifrarMovimiento);
}

export function descifrarMovimientos<T extends MovimientoCifrable>(arr: T[]): T[] {
  return arr.map(descifrarMovimiento);
}

export type RegistroSegundaFuenteCifrable = {
  idx?: number;
  fecha?: string | null;
  descripcion?: string | null;
  monto?: number | null;
  referencia?: string | null;
};

export function cifrarRegistroSegundaFuente<
  T extends RegistroSegundaFuenteCifrable,
>(r: T): T {
  return {
    ...r,
    descripcion: cifrar(r.descripcion ?? null) ?? "",
    referencia: cifrar(r.referencia),
  };
}

export function descifrarRegistroSegundaFuente<
  T extends RegistroSegundaFuenteCifrable,
>(r: T): T {
  return {
    ...r,
    descripcion: descifrar(r.descripcion ?? null) ?? "",
    referencia: descifrar(r.referencia),
  };
}

export function cifrarRegistrosSegundaFuente<
  T extends RegistroSegundaFuenteCifrable,
>(arr: T[]): T[] {
  return arr.map(cifrarRegistroSegundaFuente);
}

export function descifrarRegistrosSegundaFuente<
  T extends RegistroSegundaFuenteCifrable,
>(arr: T[]): T[] {
  return arr.map(descifrarRegistroSegundaFuente);
}

// ============================================================================
// Helpers para resultados .lean() de Mongoose.
// Mongoose .lean() devuelve POJOs sin pasar por getters; estos helpers
// reconstruyen el doc con campos descifrados sin mutar el original.
// ============================================================================

export type ExtraccionLeanLike = {
  cuenta?: string | null;
  titular?: string | null;
  movimientos?: MovimientoCifrable[];
  [k: string]: unknown;
};

/**
 * Descifra in-place los campos sensibles de un doc lean de Extraccion.
 * Devuelve el mismo objeto para encadenar. Acepta `null` (pass-through).
 */
export function descifrarExtraccionLean<T extends ExtraccionLeanLike | null>(
  doc: T,
): T {
  if (!doc) return doc;
  if (doc.cuenta !== undefined) doc.cuenta = descifrar(doc.cuenta ?? null);
  if (doc.titular !== undefined) doc.titular = descifrar(doc.titular ?? null);
  if (Array.isArray(doc.movimientos)) {
    doc.movimientos = doc.movimientos.map((m) => descifrarMovimiento(m));
  }
  return doc;
}

export function descifrarExtraccionesLean<T extends ExtraccionLeanLike>(
  arr: T[],
): T[] {
  return arr.map((d) => descifrarExtraccionLean(d) as T);
}

export type ConciliacionLeanLike = {
  segundaFuente?: {
    registros?: RegistroSegundaFuenteCifrable[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export function descifrarConciliacionLean<
  T extends ConciliacionLeanLike | null,
>(doc: T): T {
  if (!doc) return doc;
  const sf = doc.segundaFuente;
  if (sf && Array.isArray(sf.registros)) {
    sf.registros = sf.registros.map((r) => descifrarRegistroSegundaFuente(r));
  }
  return doc;
}

export function descifrarConciliacionesLean<T extends ConciliacionLeanLike>(
  arr: T[],
): T[] {
  return arr.map((d) => descifrarConciliacionLean(d) as T);
}
