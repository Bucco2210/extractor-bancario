import { z } from "zod";

const csv = (val: string): string[] =>
  val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const optionalString = z.string().trim().optional().default("");

const envSchema = z.object({
  // OpenAI
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL_DEFAULT: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_FALLBACK: z.string().default("gpt-4o"),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // MongoDB
  MONGODB_URI: z.string().min(1, "MONGODB_URI requerido"),
  MONGODB_DB_NAME: z.string().min(1).default("ethos_extractos"),

  // Vercel Blob (opcional en dev)
  BLOB_READ_WRITE_TOKEN: optionalString,

  // Auth.js
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET debe tener al menos 16 chars"),
  AUTH_URL: z.string().url().default("http://localhost:3000"),
  AUTH_TRUST_HOST: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(true),

  // Encriptación
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "APP_ENCRYPTION_KEY debe ser 64 chars hex"),

  // Aplicación
  APP_NAME: z.string().default("ETHOS Extractor Bancario"),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),
  ALLOWED_MIME_TYPES: z.string().default(
    "application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv",
  ),

  // Workspace
  MAX_PESTANAS_ABIERTAS: z.coerce.number().int().positive().default(15),
  PERSISTIR_PESTANAS_EN_MONGO: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(true),

  // Home
  HOME_MOSTRAR_ULTIMOS_N: z.coerce.number().int().positive().default(8),
  HOME_BANCOS_DESTACADOS: z.string().default(
    "galicia,nacion,provincia,santander,bbva,macro,icbc,mercado_pago",
  ),

  // Extracción por chunks
  EXTRACCION_PAGINAS_POR_CHUNK: z.coerce.number().int().positive().default(6),
  EXTRACCION_CHUNKS_PARALELO: z.coerce.number().int().positive().default(3),

  // Conciliación
  CONCILIACION_TOLERANCIA_DIAS: z.coerce.number().int().nonnegative().default(2),
  CONCILIACION_TOLERANCIA_IMPORTE_PESOS: z.coerce
    .number()
    .nonnegative()
    .default(1),
  CONCILIACION_FUZZY_UMBRAL: z.coerce.number().min(0).max(1).default(0.85),

  // Jobs (Inngest, fase 7)
  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,

  // Costos
  LIMITE_TOKENS_MENSUAL: z.coerce.number().int().positive().default(5_000_000),
  ALERTA_TOKENS_PORCENTAJE: z.coerce.number().int().min(1).max(100).default(80),

  // Seed admin
  ADMIN_SEED_EMAIL: z.string().email().default("admin@ethos.local"),
  ADMIN_SEED_PASSWORD: z.string().min(6).default("admin123"),
  ADMIN_SEED_NOMBRE: z.string().default("Admin ETHOS"),
});

type EnvRaw = z.infer<typeof envSchema>;

export type Env = Omit<
  EnvRaw,
  "ALLOWED_MIME_TYPES" | "HOME_BANCOS_DESTACADOS"
> & {
  ALLOWED_MIME_TYPES: string[];
  HOME_BANCOS_DESTACADOS: string[];
};

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Variables de entorno inválidas:\n${detalle}\n\nRevisá .env.local contra .env.example.`,
    );
  }
  const { ALLOWED_MIME_TYPES, HOME_BANCOS_DESTACADOS, ...rest } = parsed.data;
  return {
    ...rest,
    ALLOWED_MIME_TYPES: csv(ALLOWED_MIME_TYPES),
    HOME_BANCOS_DESTACADOS: csv(HOME_BANCOS_DESTACADOS),
  };
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}

/** Solo para tests: limpia el cache para forzar revalidación con un nuevo process.env. */
export function __resetEnvCache(): void {
  cached = null;
}

export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
