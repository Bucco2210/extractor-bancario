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

export type MetaChunk = {
  modelo: string;
  tokensInput: number;
  tokensOutput: number;
  tiempoMs: number;
};

export type ChunkDefinicion = {
  indice: number;
  paginas: PaginaTexto[];
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
  modelo: string;
}): Promise<{ resultado: ResultadoExtraccion; meta: MetaChunk }> {
  const client = getOpenAI();
  const { modelo } = params;

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
 * Construye las definiciones de chunks numerados a partir de las páginas
 * del PDF. La numeración es estable: el chunk N siempre cubre las mismas
 * páginas en una corrida inicial y en una reanudación.
 */
export function definirChunks(
  paginas: PaginaTexto[],
  tamanoChunk: number,
): ChunkDefinicion[] {
  return partirEnChunks(paginas, tamanoChunk).map((paginas, indice) => ({
    indice,
    paginas,
  }));
}

export type OnChunkOk = (info: {
  indice: number;
  paginas: number[];
  resultado: ResultadoExtraccion;
  meta: MetaChunk;
  ms: number;
}) => Promise<void> | void;

export type OnChunkFalla = (info: {
  indice: number;
  paginas: number[];
  error: string;
  ms: number;
}) => Promise<void> | void;

/**
 * Procesa los chunks dados en paralelo, llamando los callbacks por cada
 * chunk OK o fallido. No agrega resultados: la persistencia incremental
 * la hace el caller (ideal para reanudación).
 */
export async function procesarChunks(params: {
  chunks: ChunkDefinicion[];
  banco?: string;
  modelo?: string;
  concurrencia?: number;
  onChunkOk?: OnChunkOk;
  onChunkFalla?: OnChunkFalla;
}): Promise<void> {
  if (params.chunks.length === 0) return;
  const env = getEnv();
  const modelo = params.modelo ?? env.OPENAI_MODEL_DEFAULT;
  const concurrencia = params.concurrencia ?? env.EXTRACCION_CHUNKS_PARALELO;

  await ejecutarConPool(params.chunks, concurrencia, async (chunk) => {
    const t0 = Date.now();
    const paginasIds = chunk.paginas.map((p) => p.numero);
    try {
      const textoChunk = chunk.paginas.map((p) => p.texto).join("\n\n");
      const r = await extraerChunk({
        textoExtracto: textoChunk,
        banco: params.banco,
        modelo,
      });
      await params.onChunkOk?.({
        indice: chunk.indice,
        paginas: paginasIds,
        resultado: r.resultado,
        meta: r.meta,
        ms: Date.now() - t0,
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      await params.onChunkFalla?.({
        indice: chunk.indice,
        paginas: paginasIds,
        error: mensaje,
        ms: Date.now() - t0,
      });
    }
  });
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
