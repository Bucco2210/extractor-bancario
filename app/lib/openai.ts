import OpenAI from "openai";
import { getEnv } from "./env";

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

const SYSTEM_PROMPT = `Sos un extractor de movimientos de extractos bancarios y de billeteras virtuales argentinas.

Recibís el texto plano de un extracto. Devolvés EXCLUSIVAMENTE un JSON válido con la forma:

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
- Si no podés extraer ningún movimiento, devolvé movimientos: [].`;

export async function extraerMovimientos(params: {
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
