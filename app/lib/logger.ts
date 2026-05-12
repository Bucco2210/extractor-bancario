import pino from "pino";
import { getEnv } from "./env";

const env = getEnv();

// Salida sincrónica a stdout. Evitamos transports con worker_threads porque
// en el dev server de Next con Turbopack los logs quedan buffereados y no
// se flushean cuando una request se cuelga mucho (ej: timeout de OpenAI).
export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: { app: "ethos-extractor", env: env.APP_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({ sync: true }),
);
