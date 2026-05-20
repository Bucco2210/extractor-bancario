import { describe, it, expect } from "vitest";
import {
  parsearRespuestaDetector,
  type CandidatoPerfil,
} from "../app/lib/detector-perfil";

const candidatos: CandidatoPerfil[] = [
  {
    id: "a1",
    slug: "galicia_extracto_ars",
    nombreEntidad: "Banco Galicia",
    nombre: "Extracto CA ARS",
    categoria: "banco",
    tipoDocumento: "extracto_bancario",
    monedaPrimaria: "ARS",
    palabrasClave: ["Banco Galicia"],
  },
  {
    id: "b2",
    slug: "mercado_pago_extracto_ars",
    nombreEntidad: "Mercado Pago",
    nombre: "Extracto MP",
    categoria: "billetera",
    tipoDocumento: "extracto_bancario",
    monedaPrimaria: "ARS",
    palabrasClave: ["Mercado Pago"],
  },
];

describe("parsearRespuestaDetector", () => {
  it("resuelve perfilId a partir del slug y ordena por score", () => {
    const raw = JSON.stringify({
      candidatos: [
        {
          slug: "mercado_pago_extracto_ars",
          score: 0.6,
          razones: ["dice 'Mercado Pago'"],
        },
        {
          slug: "galicia_extracto_ars",
          score: 0.92,
          razones: ["dice 'Banco Galicia'", "encabezado coincide"],
        },
      ],
    });
    const r = parsearRespuestaDetector(raw, candidatos);
    expect(r).toHaveLength(2);
    expect(r[0]?.slug).toBe("galicia_extracto_ars");
    expect(r[0]?.perfilId).toBe("a1");
    expect(r[0]?.score).toBe(0.92);
    expect(r[1]?.slug).toBe("mercado_pago_extracto_ars");
  });

  it("descarta slugs alucinados que no estén en la lista de candidatos", () => {
    const raw = JSON.stringify({
      candidatos: [
        { slug: "inventado_xxx", score: 0.99, razones: ["?"] },
        { slug: "galicia_extracto_ars", score: 0.5, razones: [] },
      ],
    });
    const r = parsearRespuestaDetector(raw, candidatos);
    expect(r).toHaveLength(1);
    expect(r[0]?.slug).toBe("galicia_extracto_ars");
  });

  it("devuelve [] si el raw está vacío", () => {
    expect(parsearRespuestaDetector("", candidatos)).toEqual([]);
  });

  it("devuelve [] cuando 'candidatos' es array vacío", () => {
    const raw = JSON.stringify({ candidatos: [] });
    expect(parsearRespuestaDetector(raw, candidatos)).toEqual([]);
  });

  it("explota si el JSON no parsea", () => {
    expect(() => parsearRespuestaDetector("{no json", candidatos)).toThrow();
  });

  it("explota si la forma del JSON es incorrecta", () => {
    const raw = JSON.stringify({ otra_cosa: 123 });
    // candidatos default a [] → no tira por forma, pero verifico que tipos malos sí
    expect(parsearRespuestaDetector(raw, candidatos)).toEqual([]);

    const malo = JSON.stringify({
      candidatos: [{ slug: "x", score: "alto" }],
    });
    expect(() => parsearRespuestaDetector(malo, candidatos)).toThrow();
  });

  it("respeta scores fuera de rango como inválidos", () => {
    const raw = JSON.stringify({
      candidatos: [
        { slug: "galicia_extracto_ars", score: 1.5, razones: [] },
      ],
    });
    expect(() => parsearRespuestaDetector(raw, candidatos)).toThrow();
  });
});
