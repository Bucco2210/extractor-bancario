import { describe, it, expect, beforeEach } from "vitest";
import { getEnv, __resetEnvCache } from "../app/lib/env";

describe("env zod validation", () => {
  beforeEach(() => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    delete process.env.MONGODB_DB_NAME;
    process.env.AUTH_SECRET = "test-secret-suficientemente-largo-1234567890";
    process.env.APP_ENCRYPTION_KEY =
      "0000000000000000000000000000000000000000000000000000000000000000";
    process.env.APP_ENV = "test";
    delete process.env.OPENAI_API_KEY;
    __resetEnvCache();
  });

  it("acepta el set mínimo de variables y aplica defaults", () => {
    const env = getEnv();
    expect(env.MONGODB_DB_NAME).toBe("ethos_extractos");
    expect(env.OPENAI_MODEL_DEFAULT).toBe("gpt-4o-mini");
    expect(env.MAX_FILE_SIZE_MB).toBe(25);
    expect(env.ALLOWED_MIME_TYPES).toContain("application/pdf");
    expect(env.HOME_BANCOS_DESTACADOS.length).toBeGreaterThan(0);
  });

  it("rechaza APP_ENCRYPTION_KEY con largo incorrecto", () => {
    process.env.APP_ENCRYPTION_KEY = "abc";
    expect(() => getEnv()).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("rechaza AUTH_SECRET muy corto", () => {
    process.env.AUTH_SECRET = "corto";
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });
});
