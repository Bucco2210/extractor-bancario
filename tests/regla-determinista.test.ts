import { describe, it, expect } from "vitest";
import {
  aplicarRegla,
  pareceMovimiento,
} from "../app/lib/regla-determinista";

const REGLA_CLASICA =
  "^(?<fecha>\\d{2}/\\d{2}/\\d{2,4})\\s+(?<descripcion>.+?)\\s+(?<debito>-?\\d[\\d.,]*)\\s+(?<credito>-?\\d[\\d.,]*)\\s+(?<saldo>-?\\d[\\d.,]*)$";

describe("pareceMovimiento", () => {
  it("acepta líneas con fecha + monto", () => {
    expect(pareceMovimiento("03/10/2025 Pago Visa 1.234,56")).toBe(true);
  });

  it("rechaza encabezados sin datos", () => {
    expect(pareceMovimiento("Fecha   Concepto   Débito   Crédito")).toBe(
      false,
    );
  });

  it("rechaza líneas con monto pero sin fecha", () => {
    expect(pareceMovimiento("Saldo final: 1.234,56")).toBe(false);
  });
});

describe("aplicarRegla", () => {
  const TEXTO = [
    "Banco X — Extracto del 01/10/2025 al 31/10/2025",
    "Fecha       Descripción              Débito       Crédito      Saldo",
    "03/10/2025 Sueldo enero              0,00         100.000,00   100.000,00",
    "10/10/2025 Compra Visa               2.500,50     0,00         97.499,50",
    "15/10/2025 Transferencia             0,00         50.000,00    147.499,50",
    "Total del período                                                ",
  ].join("\n");

  it("extrae movimientos correctamente y devuelve match-rate", () => {
    const r = aplicarRegla(TEXTO, REGLA_CLASICA);
    expect(r.errorCompilacion).toBeNull();
    expect(r.movimientos).toHaveLength(3);
    expect(r.movimientos[0]).toMatchObject({
      fecha: "03/10/2025",
      descripcion: "Sueldo enero",
    });
    expect(r.movimientos[1]?.debito).toBe(2500.5);
    expect(r.movimientos[2]?.credito).toBe(50000);
    // las 3 líneas plausibles matchearon → 1.0
    expect(r.matchRate).toBe(1);
  });

  it("descarta líneas no-movimiento sin afectar el match-rate", () => {
    const r = aplicarRegla(TEXTO, REGLA_CLASICA);
    expect(r.lineasPlausibles).toBe(3);
    expect(r.lineasMatcheadas).toBe(3);
  });

  it("devuelve match-rate parcial cuando la regla falla en algunas líneas", () => {
    const reglaQueFalla =
      "^(?<fecha>\\d{2}/\\d{2}/\\d{2,4})\\s+SOLO_SUELDO\\s+(?<descripcion>.+)$";
    const r = aplicarRegla(TEXTO, reglaQueFalla);
    expect(r.lineasMatcheadas).toBe(0);
    expect(r.matchRate).toBe(0);
  });

  it("error de compilación queda capturado, no se lanza", () => {
    const r = aplicarRegla(TEXTO, "(?<fecha>[unclosed");
    expect(r.errorCompilacion).toBeTruthy();
    expect(r.movimientos).toHaveLength(0);
  });

  it("parsea monto en formato AR 1.234.567,89", () => {
    const texto = "03/10/2025 Pago 1.234.567,89 0 0";
    const r = aplicarRegla(texto, REGLA_CLASICA);
    expect(r.movimientos[0]?.debito).toBe(1234567.89);
  });

  it("acepta groups opcionales ausentes", () => {
    const reglaSinSaldo =
      "^(?<fecha>\\d{2}/\\d{2}/\\d{2,4})\\s+(?<descripcion>.+?)\\s+(?<credito>\\d[\\d.,]*)$";
    const r = aplicarRegla("03/10/2025 Sueldo 100.000,00", reglaSinSaldo);
    expect(r.movimientos).toHaveLength(1);
    expect(r.movimientos[0]?.saldo).toBeNull();
    expect(r.movimientos[0]?.debito).toBeNull();
    expect(r.movimientos[0]?.credito).toBe(100000);
  });
});
