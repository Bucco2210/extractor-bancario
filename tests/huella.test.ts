import { describe, it, expect } from "vitest";
import {
  calcularHuella,
  normalizarLineaParaHuella,
  tomarLineasParaHuella,
} from "../app/lib/huella";

describe("normalizarLineaParaHuella", () => {
  it("quita fechas dd/mm/yyyy", () => {
    expect(normalizarLineaParaHuella("Movimiento del 03/10/2025")).toBe(
      "movimiento del",
    );
  });

  it("quita montos con coma decimal y separadores de miles", () => {
    expect(
      normalizarLineaParaHuella("Saldo final: 1.234.567,89"),
    ).toBe("saldo final:");
  });

  it("quita montos negativos y dígitos sueltos", () => {
    expect(normalizarLineaParaHuella("Débito -250.00 ref 99")).toBe(
      "débito ref",
    );
  });

  it("conserva el texto fijo entre extractos", () => {
    const a = normalizarLineaParaHuella(
      "Banco Galicia S.A. - Caja de Ahorro 1234567",
    );
    const b = normalizarLineaParaHuella(
      "Banco Galicia S.A. - Caja de Ahorro 9876543",
    );
    expect(a).toBe(b);
    expect(a).toContain("banco galicia");
    expect(a).toContain("caja de ahorro");
  });
});

describe("tomarLineasParaHuella", () => {
  it("respeta la cantidad y descarta líneas vacías", () => {
    const texto = ["a", "", "  ", "b", "c", "d", "e", "f"].join("\n");
    const r = tomarLineasParaHuella(texto, 3);
    expect(r).toEqual(["a", "b", "c"]);
  });
});

describe("calcularHuella", () => {
  it("misma huella para extractos del mismo banco con datos distintos", () => {
    const enero = [
      "Banco Galicia S.A.",
      "Caja de Ahorro Pesos",
      "Período: 01/01/2025 al 31/01/2025",
      "Movimiento del 03/01/2025 - 1.000,00",
      "Movimiento del 15/01/2025 - 2.500,00",
    ].join("\n");
    const febrero = [
      "Banco Galicia S.A.",
      "Caja de Ahorro Pesos",
      "Período: 01/02/2025 al 28/02/2025",
      "Movimiento del 07/02/2025 - 9.999,99",
      "Movimiento del 20/02/2025 - 100,00",
    ].join("\n");
    const a = calcularHuella(enero, 10);
    const b = calcularHuella(febrero, 10);
    expect(a.huella).toBe(b.huella);
  });

  it("huellas distintas para bancos distintos", () => {
    const galicia = "Banco Galicia S.A.\nCaja de Ahorro Pesos\n";
    const mp = "Mercado Pago S.R.L.\nCuenta Mercado Pago\n";
    const a = calcularHuella(galicia, 5);
    const b = calcularHuella(mp, 5);
    expect(a.huella).not.toBe(b.huella);
  });

  it("devuelve hash hex SHA-256 (64 chars)", () => {
    const r = calcularHuella("hola mundo", 5);
    expect(r.huella).toMatch(/^[0-9a-f]{64}$/);
  });

  it("incluye un resumen legible para debug", () => {
    const r = calcularHuella("Banco X\nCaja de Ahorro", 5);
    expect(r.resumen).toContain("banco x");
    expect(r.resumen).toContain("caja de ahorro");
  });
});
