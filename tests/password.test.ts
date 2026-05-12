import { describe, it, expect } from "vitest";
import { hashearPassword, verificarPassword } from "../app/lib/password";

describe("password", () => {
  it("hashea y verifica correctamente", async () => {
    const hash = await hashearPassword("secreto123");
    expect(hash).not.toEqual("secreto123");
    expect(await verificarPassword("secreto123", hash)).toBe(true);
    expect(await verificarPassword("otro", hash)).toBe(false);
  });

  it("rechaza contraseñas demasiado cortas", async () => {
    await expect(hashearPassword("123")).rejects.toThrow();
  });

  it("verificarPassword devuelve false con inputs vacíos", async () => {
    expect(await verificarPassword("", "hash")).toBe(false);
    expect(await verificarPassword("pwd", "")).toBe(false);
  });
});
