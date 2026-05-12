import OpenAI from "openai";
import { getEnv } from "./env";
import type { PaginaTexto } from "./pdf";

let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (cached) return cached;
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY no configurado. Completalo en .env.local antes de usar la extracción.",
    );
  }
  cached = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: env.OPENAI_MAX_RETRIES,
    timeout: env.OPENAI_TIMEOUT_MS,
  });
  return cached;
}

export type MovimientoExtraido = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  debito: number | null;
  credito: number | null;
  saldo: number | null;
};

export type ResultadoExtraccion = {
  cuenta: string | null;
  periodo: string | null;
  titular: string | null;
  movimientos: MovimientoExtraido[];
};

export type MetaExtraccion = {
  modelo: string;
  tokensInput: number;
  tokensOutput: number;
  tiempoMs: number;
};

export type ChunkFallido = {
  indice: number;
  paginas: number[];
  error: string;
};

export type ResultadoChunkeado = {
  resultado: ResultadoExtraccion;
  meta: MetaExtraccion & {
    chunksTotal: number;
    chunksOk: number;
    chunksFallidos: ChunkFallido[];
  };
};

const SYSTEM_PROMPT = `Sos un extractor de movimientos de extractos bancarios y de billeteras virtuales argentinas.

Recibís el texto plano de un extracto (o un fragmento). Devolvés EXCLUSIVAMENTE un JSON válido con la forma:

{
  "cuenta": string | null,
  "periodo": string | null,
  "titular": string | null,
  "movimientos": [
    {
      "fecha": "DD/MM/YYYY",
      "descripcion": string,
      "referencia": string | null,
      "debito": number | null,
      "credito": number | null,
      "saldo": number | null
    }
  ]
}

Reglas:
- Para cada movimiento, debito o credito tiene valor y el otro es null.
- Los importes son números (no strings). Usar punto como separador decimal.
- Fechas siempre en DD/MM/YYYY.
- No inventes datos: si un campo no aparece en el texto, dejalo como null.
- Ignorá totales, subtotales, leyendas legales y publicidad.
- Si el texto es un fragmento intermedio sin encabezado, igual extraé los movimientos y dejá cuenta/periodo/titular en null.
- Si no podés extraer ningún movimiento, devolvé movimientos: [].`;

async function extraerChunk(params: {
  textoExtracto: string;
  banco?: string;
  modelo?: string;
}): Promise<{ resultado: ResultadoExtraccion; meta: MetaExtraccion }> {
  const env = getEnv();
  const client = getOpenAI();
  const modelo = params.modelo ?? env.OPENAI_MODEL_DEFAULT;

  const userParts: string[] = [];
  if (params.banco) userParts.push(`Banco/entidad: ${params.banco}`);
  userParts.push("Texto del extracto:");
  userParts.push(params.textoExtracto);

  const inicio = Date.now();
  const response = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userParts.join("\n\n") },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  const tiempoMs = Date.now() - inicio;

  const raw = response.choices[0]?.message?.content ?? "";
  const resultado = parsearRespuestaOpenAI(raw);
  return {
    resultado,
    meta: {
      modelo,
      tokensInput: response.usage?.prompt_tokens ?? 0,
      tokensOutput: response.usage?.completion_tokens ?? 0,
      tiempoMs,
    },
  };
}

/**
 * Versión legacy single-shot: extrae todo en una sola llamada.
 * Se mantiene para casos chicos o tests. El path productivo es
 * `extraerMovimientosDeChunks`.
 */
export async function extraerMovimientos(params: {
  textoExtracto: string;
  banco?: string;
  modelo?: string;
}): Promise<{ resultado: ResultadoExtraccion; meta: MetaExtraccion }> {
  return extraerChunk(params);
}

/**
 * Parte las páginas en bloques, las procesa con concurrencia limitada
 * y agrega los resultados. Si algún chunk falla, los demás siguen y
 * el chunk fallido queda registrado en `meta.chunksFallidos`.
 */
export async function extraerMovimientosDeChunks(params: {
  paginas: PaginaTexto[];
  banco?: string;
  modelo?: string;
  onChunkProgreso?: (info: {
    indice: number;
    total: number;
    ok: boolean;
    paginas: number[];
    ms: number;
    movimientos?: number;
    error?: string;
  }) => void;
}): Promise<ResultadoChunkeado> {
  const env = getEnv();
  const modelo = params.modelo ?? env.OPENAI_MODEL_DEFAULT;
  const tamanoChunk = env.EXTRACCION_PAGINAS_POR_CHUNK;
  const concurrencia = env.EXTRACCION_CHUNKS_PARALELO;

  const chunks = partirEnChunks(params.paginas, tamanoChunk);
  if (chunks.length === 0) {
    return {
      resultado: { cuenta: null, periodo: null, titular: null, movimientos: [] },
      meta: {
        modelo,
        tokensInput: 0,
        tokensOutput: 0,
        tiempoMs: 0,
        chunksTotal: 0,
        chunksOk: 0,
        chunksFallidos: [],
      },
    };
  }

  const inicioTotal = Date.now();
  const exitosos: Array<{ indice: number; resultado: ResultadoExtraccion; meta: MetaExtraccion }> = [];
  const fallidos: ChunkFallido[] = [];

  await ejecutarConPool(chunks, concurrencia, async (chunk, indice) => {
    const t0 = Date.now();
    const paginasIds = chunk.map((p) => p.numero);
    try {
      const textoChunk = chunk.map((p) => p.texto).join("\n\n");
      const r = await extraerChunk({
        textoExtracto: textoChunk,
        banco: params.banco,
        modelo,
      });
      exitosos.push({ indice, resultado: r.resultado, meta: r.meta });
      params.onChunkProgreso?.({
        indice,
        total: chunks.length,
        ok: true,
        paginas: paginasIds,
        ms: Date.now() - t0,
        movimientos: r.resultado.movimientos.length,
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      fallidos.push({ indice, paginas: paginasIds, error: mensaje });
      params.onChunkProgreso?.({
        indice,
        total: chunks.length,
        ok: false,
        paginas: paginasIds,
        ms: Date.now() - t0,
        error: mensaje,
      });
    }
  });

  exitosos.sort((a, b) => a.indice - b.indice);
  fallidos.sort((a, b) => a.indice - b.indice);

  const resultado: ResultadoExtraccion = {
    cuenta: primeraConValor(exitosos, (r) => r.resultado.cuenta),
    periodo: primeraConValor(exitosos, (r) => r.resultado.periodo),
    titular: primeraConValor(exitosos, (r) => r.resultado.titular),
    movimientos: exitosos.flatMap((r) => r.resultado.movimientos),
  };

  const tokensInput = exitosos.reduce((s, r) => s + r.meta.tokensInput, 0);
  const tokensOutput = exitosos.reduce((s, r) => s + r.meta.tokensOutput, 0);

  return {
    resultado,
    meta: {
      modelo,
      tokensInput,
      tokensOutput,
      tiempoMs: Date.now() - inicioTotal,
      chunksTotal: chunks.length,
      chunksOk: exitosos.length,
      chunksFallidos: fallidos,
    },
  };
}

export function partirEnChunks(
  paginas: PaginaTexto[],
  tamanoChunk: number,
): PaginaTexto[][] {
  if (tamanoChunk <= 0) throw new Error("tamanoChunk debe ser positivo");
  const chunks: PaginaTexto[][] = [];
  for (let i = 0; i < paginas.length; i += tamanoChunk) {
    chunks.push(paginas.slice(i, i + tamanoChunk));
  }
  return chunks;
}

export async function ejecutarConPool<T>(
  items: T[],
  concurrencia: number,
  fn: (item: T, indice: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrencia), items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        const item = items[i];
        if (item === undefined) return;
        await fn(item, i);
      }
    },
  );
  await Promise.all(workers);
}

function primeraConValor<T>(
  arr: T[],
  getter: (item: T) => string | null,
): string | null {
  for (const item of arr) {
    const v = getter(item);
    if (v) return v;
  }
  return null;
}

export function parsearRespuestaOpenAI(raw: string): ResultadoExtraccion {
  if (!raw.trim()) {
    return { cuenta: null, periodo: null, titular: null, movimientos: [] };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("La respuesta de OpenAI no es JSON válido.");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("La respuesta de OpenAI no es un objeto JSON.");
  }
  const obj = data as Record<string, unknown>;
  const movimientosRaw = Array.isArray(obj.movimientos) ? obj.movimientos : [];
  const movimientos: MovimientoExtraido[] = movimientosRaw.map((m) => {
    const o = m as Record<string, unknown>;
    return {
      fecha: typeof o.fecha === "string" ? o.fecha : "",
      descripcion: typeof o.descripcion === "string" ? o.descripcion : "",
      referencia: typeof o.referencia === "string" ? o.referencia : null,
      debito: typeof o.debito === "number" ? o.debito : null,
      credito: typeof o.credito === "number" ? o.credito : null,
      saldo: typeof o.saldo === "number" ? o.saldo : null,
    };
  });
  return {
    cuenta: typeof obj.cuenta === "string" ? obj.cuenta : null,
    periodo: typeof obj.periodo === "string" ? obj.periodo : null,
    titular: typeof obj.titular === "string" ? obj.titular : null,
    movimientos,
  };
}
