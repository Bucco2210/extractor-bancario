import { describe, it, expect } from "vitest";
import {
  STORAGE_KEY,
  SCRIPT_ANTI_FLASH,
  leerPreferencia,
  resolverTema,
} from "../app/lib/tema";

describe("resolverTema", () => {
  it("respeta el valor guardado 'dark'", () => {
    expect(resolverTema("dark", false)).toBe("dark");
    expect(resolverTema("dark", true)).toBe("dark");
  });

  it("respeta el valor guardado 'light'", () => {
    expect(resolverTema("light", false)).toBe("light");
    expect(resolverTema("light", true)).toBe("light");
  });

  it("cae al sistema cuando no hay valor guardado", () => {
    expect(resolverTema(null, true)).toBe("dark");
    expect(resolverTema(null, false)).toBe("light");
  });

  it("ignora valores guardados que no sean 'dark'/'light'", () => {
    expect(resolverTema("auto", true)).toBe("dark");
    expect(resolverTema("", false)).toBe("light");
    expect(resolverTema("oscurito", true)).toBe("dark");
  });
});

describe("leerPreferencia", () => {
  it("devuelve 'dark' / 'light' si están guardados", () => {
    expect(leerPreferencia("dark")).toBe("dark");
    expect(leerPreferencia("light")).toBe("light");
  });

  it("devuelve 'system' cuando no hay nada o es inválido", () => {
    expect(leerPreferencia(null)).toBe("system");
    expect(leerPreferencia("")).toBe("system");
    expect(leerPreferencia("xx")).toBe("system");
  });
});

describe("SCRIPT_ANTI_FLASH", () => {
  it("referencia la clave de localStorage correcta", () => {
    expect(SCRIPT_ANTI_FLASH).toContain(JSON.stringify(STORAGE_KEY));
  });

  it("solo agrega la clase 'dark' (nunca la quita) para no pisar SSR", () => {
    expect(SCRIPT_ANTI_FLASH).toContain("classList.add('dark')");
    expect(SCRIPT_ANTI_FLASH).not.toContain("classList.remove");
  });

  it("envuelve todo en try/catch para no romper si localStorage falla", () => {
    expect(SCRIPT_ANTI_FLASH).toContain("try");
    expect(SCRIPT_ANTI_FLASH).toContain("catch");
  });
});
