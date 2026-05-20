import { z } from "zod";
import { getOpenAI } from "./openai";
import { getEnv } from "./env";

export type CandidatoPerfil = {
  id: string;
  slug: string;
  nombreEntidad: string;
  nombre: string;
  categoria: string;
  tipoDocumento: string;
  monedaPrimaria: string;
  palabrasClave: string[];
};

export type Coincidencia = {
  perfilId: string;
  slug: string;
  score: number;
  razones: string[];
};

export type ResultadoDeteccion = {
  mejor: Coincidencia | null;
  candidatos: Coincidencia[];
  modelo: string;
  tokensInput: number;
  tokensOutput: number;
  tiempoMs: number;
};

const TEXTO_MAX_CHARS = 8_000;
const TOP_N_DEFAULT = 3;

const SYSTEM_PROMPT = `Sos un clasificador de extractos bancarios y de billeteras virtuales argentinas.

Recibís:
- Un fragmento de texto extraído de un PDF de extracto (encabezado y/o cuerpo).
- Una lista de perfiles candidatos con su slug, nombre de entidad y palabras clave esperadas.

Tu tarea: elegir hasta los TOP_N candidatos más probables y devolver EXCLUSIVAMENTE este JSON:

{
  "candidatos": [
    {
      "slug": "<slug del perfil candidato exactamente como vino en la lista>",
      "score": <número entre 0 y 1>,
      "razones": ["<frase corta>", ...]
    }
  ]
}

Reglas:
- score = 0 cuando no hay evidencia. score >= 0.85 solo si hay coincidencias claras con la entidad (razón social, marca, CBU prefix u otro indicador propio).
- Las razones son frases cortas en español que citan las palabras clave o señales encontradas en el texto.
- Si ningún candidato encaja, devolvé "candidatos": [].
- No inventes slugs: usá tal cual los que vinieron en la lista.
- Ordená los candidatos por score descendente.`;

const respuestaSchema = z.object({
  candidatos: z
    .array(
      z.object({
        slug: z.string().trim(),
        score: z.number().min(0).max(1),
        razones: z.array(z.string().trim()).default([]),
      }),
    )
    .default([]),
});

export async function detectarPerfil(params: {
  texto: string;
  candidatos: CandidatoPerfil[];
  topN?: number;
  modelo?: string;
}): Promise<ResultadoDeteccion> {
  const env = getEnv();
  const modelo = params.modelo ?? env.OPENAI_MODEL_DEFAULT;
  const topN = params.topN ?? TOP_N_DEFAULT;

  if (params.candidatos.length === 0) {
    return {
      mejor: null,
      candidatos: [],
      modelo,
      tokensInput: 0,
      tokensOutput: 0,
      tiempoMs: 0,
    };
  }

  const textoTruncado = params.texto.slice(0, TEXTO_MAX_CHARS);
  const lista = params.candidatos.map((c) => ({
    slug: c.slug,
    entidad: c.nombreEntidad,
    nombre: c.nombre,
    categoria: c.categoria,
    tipoDocumento: c.tipoDocumento,
    moneda: c.monedaPrimaria,
    palabrasClave: c.palabrasClave,
  }));

  const userPrompt = [
    `TOP_N = ${topN}`,
    "Candidatos:",
    JSON.stringify(lista, null, 2),
    "Texto del extracto:",
    textoTruncado,
  ].join("\n\n");

  const client = getOpenAI();
  const inicio = Date.now();
  const response = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  const tiempoMs = Date.now() - inicio;

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parsearRespuestaDetector(raw, params.candidatos);

  return {
    mejor: parsed[0] ?? null,
    candidatos: parsed.slice(0, topN),
    modelo,
    tokensInput: response.usage?.prompt_tokens ?? 0,
    tokensOutput: response.usage?.completion_tokens ?? 0,
    tiempoMs,
  };
}

/**
 * Parsea la respuesta del detector y la cruza contra la lista de
 * candidatos enviada para descartar slugs alucinados y resolver el
 * perfilId real.
 */
export function parsearRespuestaDetector(
  raw: string,
  candidatos: CandidatoPerfil[],
): Coincidencia[] {
  if (!raw.trim()) return [];

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("La respuesta del detector no es JSON válido.");
  }

  const parsed = respuestaSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `La respuesta del detector no tiene la forma esperada: ${parsed.error.message}`,
    );
  }

  const porSlug = new Map(candidatos.map((c) => [c.slug, c]));
  const out: Coincidencia[] = [];
  for (const item of parsed.data.candidatos) {
    const c = porSlug.get(item.slug);
    if (!c) continue;
    out.push({
      perfilId: c.id,
      slug: c.slug,
      score: item.score,
      razones: item.razones,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
