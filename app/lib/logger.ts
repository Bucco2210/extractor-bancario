import pino from "pino";
import { getEnv } from "./env";

const env = getEnv();

const isProd = env.APP_ENV === "production";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: "ethos-extractor", env: env.APP_ENV },
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,app,env",
          },
        },
      }),
});
