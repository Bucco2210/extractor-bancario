import { describe, it, expect } from "vitest";
import {
  armarHomeResumen,
  type PerfilLean,
  type ExtraccionLean,
} from "../app/lib/home-resumen";

const perfiles: PerfilLean[] = [
  {
    _id: "p_gal_ext",
    slug: "galicia_extracto_ars",
    entidad: { slug: "galicia", nombre: "Banco Galicia" },
    categoria: "banco",
    nombre: "Extracto CA ARS",
    tipoDocumento: "extracto_bancario",
    monedaPrimaria: "ARS",
    ordenEnGrid: 10,
  },
  {
    _id: "p_gal_tc",
    slug: "galicia_tarjeta_credito",
    entidad: { slug: "galicia", nombre: "Banco Galicia" },
    categoria: "banco",
    nombre: "Tarjeta Crédito Visa",
    tipoDocumento: "tarjeta_credito",
    monedaPrimaria: "ARS",
    ordenEnGrid: 15,
  },
  {
    _id: "p_mp",
    slug: "mercado_pago_extracto_ars",
    entidad: { slug: "mercado_pago", nombre: "Mercado Pago" },
    categoria: "billetera",
    nombre: "Extracto MP",
    tipoDocumento: "extracto_bancario",
    monedaPrimaria: "ARS",
    ordenEnGrid: 200,
  },
];

describe("armarHomeResumen", () => {
  it("agrupa perfiles por entidad.slug en bancos únicos", () => {
    const r = armarHomeResumen({
      perfiles,
      bancosFavoritos: [],
      bancosDestacados: [],
      conteoPorPerfil: [],
      ultimosDocs: [],
    });
    expect(r.bancos).toHaveLength(2);
    const galicia = r.bancos.find((b) => b.entidad.slug === "galicia");
    expect(galicia?.perfiles).toHaveLength(2);
    expect(galicia?.categoria).toBe("banco");
    const mp = r.bancos.find((b) => b.entidad.slug === "mercado_pago");
    expect(mp?.categoria).toBe("billetera");
  });

  it("ordena bancos por ordenEnGrid (menor primero)", () => {
    const r = armarHomeResumen({
      perfiles,
      bancosFavoritos: [],
      bancosDestacados: [],
      conteoPorPerfil: [],
      ultimosDocs: [],
    });
    expect(r.bancos.map((b) => b.entidad.slug)).toEqual([
      "galicia",
      "mercado_pago",
    ]);
  });

  it("toma el ordenEnGrid mínimo por entidad cuando hay varios perfiles", () => {
    const r = armarHomeResumen({
      perfiles: [
        // perfil con orden alto primero
        {
          ...perfiles[1]!,
          _id: "x",
          ordenEnGrid: 999,
        },
        // perfil con orden bajo después — debería ganar
        { ...perfiles[0]!, _id: "y", ordenEnGrid: 5 },
      ],
      bancosFavoritos: [],
      bancosDestacados: [],
      conteoPorPerfil: [],
      ultimosDocs: [],
    });
    const galicia = r.bancos.find((b) => b.entidad.slug === "galicia");
    expect(galicia?.ordenEnGrid).toBe(5);
  });

  it("marca favoritos y los lista", () => {
    const r = armarHomeResumen({
      perfiles,
      bancosFavoritos: ["mercado_pago"],
      bancosDestacados: [],
      conteoPorPerfil: [],
      ultimosDocs: [],
    });
    expect(
      r.bancos.find((b) => b.entidad.slug === "mercado_pago")?.esFavorito,
    ).toBe(true);
    expect(
      r.bancos.find((b) => b.entidad.slug === "galicia")?.esFavorito,
    ).toBe(false);
    expect(r.favoritos).toEqual(["mercado_pago"]);
  });

  it("preserva el orden declarado de destacados y filtra los que no existen", () => {
    const r = armarHomeResumen({
      perfiles,
      bancosFavoritos: [],
      bancosDestacados: ["inexistente", "mercado_pago", "galicia"],
      conteoPorPerfil: [],
      ultimosDocs: [],
    });
    expect(r.destacados).toEqual(["mercado_pago", "galicia"]);
  });

  it("suma extracciones del usuario por entidad", () => {
    const r = armarHomeResumen({
      perfiles,
      bancosFavoritos: [],
      bancosDestacados: [],
      conteoPorPerfil: [
        { _id: "p_gal_ext", count: 3 },
        { _id: "p_gal_tc", count: 2 },
        { _id: "p_mp", count: 5 },
      ],
      ultimosDocs: [],
    });
    expect(
      r.bancos.find((b) => b.entidad.slug === "galicia")
        ?.extraccionesDelUsuario,
    ).toBe(5);
    expect(
      r.bancos.find((b) => b.entidad.slug === "mercado_pago")
        ?.extraccionesDelUsuario,
    ).toBe(5);
  });

  it("denormaliza nombre de perfil + entidadSlug en últimos", () => {
    const ultimosDocs: ExtraccionLean[] = [
      {
        _id: "e1",
        perfilId: "p_gal_ext",
        banco: "Banco Galicia",
        cuenta: "1234",
        periodo: "10/2025",
        titular: null,
        estado: "extraido",
        movimientos: [{}, {}, {}],
        createdAt: new Date("2026-05-20T12:00:00Z"),
      },
      {
        _id: "e2",
        perfilId: null,
        banco: null,
        estado: "procesando",
      },
    ];
    const r = armarHomeResumen({
      perfiles,
      bancosFavoritos: [],
      bancosDestacados: [],
      conteoPorPerfil: [],
      ultimosDocs,
    });
    expect(r.ultimos).toHaveLength(2);
    expect(r.ultimos[0]).toMatchObject({
      id: "e1",
      perfilNombre: "Extracto CA ARS",
      entidadSlug: "galicia",
      movimientosCount: 3,
      estado: "extraido",
    });
    expect(r.ultimos[1]).toMatchObject({
      id: "e2",
      perfilNombre: null,
      entidadSlug: null,
      movimientosCount: 0,
    });
  });
});
