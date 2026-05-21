import { describe, it, expect } from "vitest";
import { AppError, respuestaError } from "../app/lib/errors";

describe("AppError", () => {
  it("conserva codigo, mensaje y detalles", () => {
    const err = new AppError("INPUT_INVALIDO", "campo X faltante", {
      campo: "X",
    });
    expect(err.codigo).toBe("INPUT_INVALIDO");
    expect(err.message).toBe("campo X faltante");
    expect(err.detalles).toEqual({ campo: "X" });
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });
});

describe("respuestaError", () => {
  it("INPUT_INVALIDO → 400", async () => {
    const res = respuestaError(new AppError("INPUT_INVALIDO", "x"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INPUT_INVALIDO");
    expect(body.mensaje).toBe("x");
  });

  it("SIN_AUTH → 401", async () => {
    const res = respuestaError(new AppError("SIN_AUTH", "x"));
    expect(res.status).toBe(401);
  });

  it("SIN_PERMISO → 403", async () => {
    const res = respuestaError(new AppError("SIN_PERMISO", "x"));
    expect(res.status).toBe(403);
  });

  it("NO_ENCONTRADO → 404", async () => {
    const res = respuestaError(new AppError("NO_ENCONTRADO", "x"));
    expect(res.status).toBe(404);
  });

  it("NO_PROCESABLE → 422", async () => {
    const res = respuestaError(new AppError("NO_PROCESABLE", "x"));
    expect(res.status).toBe(422);
  });

  it("LIMITE_EXCEDIDO → 429", async () => {
    const res = respuestaError(new AppError("LIMITE_EXCEDIDO", "x"));
    expect(res.status).toBe(429);
  });

  it("INTERNO → 500", async () => {
    const res = respuestaError(new AppError("INTERNO", "boom"));
    expect(res.status).toBe(500);
  });

  it("error no-AppError → 500 con mensaje genérico", async () => {
    const res = respuestaError(new Error("DB down"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("INTERNO");
    expect(body.mensaje).toBe("DB down");
  });

  it("err no-Error → 500 con mensaje 'Error desconocido'", async () => {
    const res = respuestaError("string raro");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.mensaje).toBe("Error desconocido");
  });

  it("detalles default a null si no se pasan", async () => {
    const res = respuestaError(new AppError("INTERNO", "x"));
    const body = await res.json();
    expect(body.detalles).toBe(null);
  });
});
