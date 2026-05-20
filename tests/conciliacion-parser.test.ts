import { describe, it, expect } from "vitest";
import {
  aplicarMapeo,
  detectarMapeo,
  parsearCSV,
  parsearFecha,
  parsearImporte,
  parsearSegundaFuente,
} from "../app/lib/conciliacion-parser";

describe("detectarMapeo", () => {
  it("matchea por nombre exacto normalizado", () => {
    const m = detectarMapeo(["Fecha", "Descripción", "Importe", "Ref"]);
    expect(m.fecha).toBe("Fecha");
    expect(m.descripcion).toBe("Descripción");
    expect(m.monto).toBe("Importe");
    expect(m.referencia).toBe("Ref");
  });

  it("usa sinónimos en inglés y caída al fallback de includes", () => {
    const m = detectarMapeo(["DATE", "Detalle operación", "amount_ars"]);
    expect(m.fecha).toBe("DATE");
    expect(m.descripcion).toBe("Detalle operación");
    expect(m.monto).toBe("amount_ars");
    expect(m.referencia).toBeNull();
  });

  it("deja en null lo que no encuentra", () => {
    const m = detectarMapeo(["XX", "YY"]);
    expect(m).toEqual({
      fecha: null,
      descripcion: null,
      monto: null,
      referencia: null,
    });
  });
});

describe("parsearCSV", () => {
  it("autodetecta separador punto y coma", () => {
    const { headers, filas } = parsearCSV("a;b;c\n1;2;3\n");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(filas).toEqual([["1", "2", "3"]]);
  });

  it("soporta campos con comillas y escape doble", () => {
    const { headers, filas } = parsearCSV(
      'fecha,descripcion,monto\n01/03/2026,"Pago ""ACME"" S.A.",1.000\n',
    );
    expect(headers).toEqual(["fecha", "descripcion", "monto"]);
    expect(filas[0]).toEqual(["01/03/2026", 'Pago "ACME" S.A.', "1.000"]);
  });

  it("ignora filas vacías y respeta BOM inicial", () => {
    const { headers, filas } = parsearCSV("﻿a,b\n\n1,2\n");
    expect(headers).toEqual(["a", "b"]);
    expect(filas).toEqual([["1", "2"]]);
  });
});

describe("parsearImporte", () => {
  it("formato AR: 1.234,56", () => {
    expect(parsearImporte("1.234,56")).toBeCloseTo(1234.56);
  });
  it("formato US: 1,234.56", () => {
    expect(parsearImporte("1,234.56")).toBeCloseTo(1234.56);
  });
  it("solo comas con dos decimales → AR", () => {
    expect(parsearImporte("12,34")).toBeCloseTo(12.34);
  });
  it("solo comas como miles", () => {
    expect(parsearImporte("1,234")).toBeCloseTo(1234);
  });
  it("vacíos y guiones devuelven null", () => {
    expect(parsearImporte("")).toBeNull();
    expect(parsearImporte("-")).toBeNull();
    expect(parsearImporte(null)).toBeNull();
  });
});

describe("parsearFecha", () => {
  it("normaliza a DD/MM/YYYY", () => {
    expect(parsearFecha("1/3/2026")).toBe("01/03/2026");
    expect(parsearFecha("01-03-26")).toBe("01/03/2026");
    expect(parsearFecha("2026-03-01")).toBe("01/03/2026");
  });
  it("devuelve null si no entiende el formato", () => {
    expect(parsearFecha("hoy")).toBeNull();
    expect(parsearFecha("")).toBeNull();
  });
});

describe("aplicarMapeo", () => {
  it("salta filas totalmente vacías", () => {
    const headers = ["fecha", "descripcion", "monto"];
    const filas = [
      { fecha: "01/03/2026", descripcion: "Pago", monto: "1.000,00" },
      { fecha: "", descripcion: "", monto: "" },
    ];
    const res = aplicarMapeo(headers, filas, {
      fecha: "fecha",
      descripcion: "descripcion",
      monto: "monto",
      referencia: null,
    });
    expect(res).toHaveLength(1);
    expect(res[0]?.fecha).toBe("01/03/2026");
    expect(res[0]?.monto).toBeCloseTo(1000);
  });
});

describe("parsearSegundaFuente (CSV)", () => {
  it("devuelve mapeo_incompleto si faltan columnas requeridas", async () => {
    const buffer = Buffer.from("foo,bar\n1,2\n", "utf8");
    const r = await parsearSegundaFuente({
      buffer,
      nombreArchivo: "cobranzas.csv",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.razon).toBe("mapeo_incompleto");
      expect(r.camposFaltantes).toEqual(
        expect.arrayContaining(["fecha", "descripcion", "monto"]),
      );
    }
  });

  it("parsea bien con auto-detección y respeta el override", async () => {
    // El CSV de cobranzas usa comas en el monto, así que va entre comillas
    // para que no rompa el split.
    const csvComillas =
      'fecha,detalle,importe\n01/03/2026,Pago ACME,"1.000,00"\n';
    const r = await parsearSegundaFuente({
      buffer: Buffer.from(csvComillas, "utf8"),
      nombreArchivo: "cobranzas.csv",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.registros).toHaveLength(1);
      expect(r.data.registros[0]?.monto).toBeCloseTo(1000);
      expect(r.data.mapeoColumnas.descripcion).toBe("detalle");
    }

    const rOverride = await parsearSegundaFuente({
      buffer: Buffer.from(csvComillas, "utf8"),
      nombreArchivo: "cobranzas.csv",
      mapeoOverride: {
        fecha: "fecha",
        descripcion: "detalle",
        monto: "importe",
        referencia: null,
      },
    });
    expect(rOverride.ok).toBe(true);
  });
});
