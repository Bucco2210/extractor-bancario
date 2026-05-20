import { describe, it, expect } from "vitest";
import {
  bancosVisibles,
  perfilesVisibles,
  type Banco,
} from "../app/lib/home-tipos";

function banco(
  slug: string,
  categoria: "banco" | "billetera",
  perfiles: Array<{ tipoDocumento: string }>,
  opts: { favorito?: boolean } = {},
): Banco {
  return {
    entidad: { slug, nombre: slug, iconoUrl: null },
    categoria,
    perfiles: perfiles.map((p, i) => ({
      id: `${slug}_${i}`,
      slug: `${slug}_${i}`,
      nombre: `${slug} ${i}`,
      tipoDocumento: p.tipoDocumento,
      monedaPrimaria: "ARS",
    })),
    esFavorito: opts.favorito ?? false,
    esDestacado: false,
    extraccionesDelUsuario: 0,
    ordenEnGrid: 100,
  };
}

const bancos: Banco[] = [
  banco("galicia", "banco", [{ tipoDocumento: "extracto_bancario" }]),
  banco(
    "mercado_pago",
    "billetera",
    [
      { tipoDocumento: "extracto_bancario" },
      { tipoDocumento: "tarjeta_credito" },
    ],
    { favorito: true },
  ),
  banco("bbva", "banco", [{ tipoDocumento: "tarjeta_debito" }]),
  banco("uala", "billetera", [{ tipoDocumento: "extracto_bancario" }]),
];

describe("bancosVisibles", () => {
  it("filtra por categoría banco", () => {
    expect(bancosVisibles(bancos, "banco").map((b) => b.entidad.slug)).toEqual([
      "galicia",
      "bbva",
    ]);
  });

  it("filtra por categoría billetera", () => {
    expect(
      bancosVisibles(bancos, "billetera").map((b) => b.entidad.slug),
    ).toEqual(["mercado_pago", "uala"]);
  });

  it("tarjeta devuelve solo entidades con al menos un perfil de tarjeta", () => {
    expect(
      bancosVisibles(bancos, "tarjeta").map((b) => b.entidad.slug),
    ).toEqual(["mercado_pago", "bbva"]);
  });

  it("favoritos devuelve solo entidades marcadas", () => {
    expect(
      bancosVisibles(bancos, "favoritos").map((b) => b.entidad.slug),
    ).toEqual(["mercado_pago"]);
  });
});

describe("perfilesVisibles", () => {
  it("para tarjeta filtra los perfiles del banco a solo los de tarjeta", () => {
    const mp = bancos[1]!;
    const visibles = perfilesVisibles(mp, "tarjeta");
    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.tipoDocumento).toBe("tarjeta_credito");
  });

  it("para otras tabs devuelve todos los perfiles del banco", () => {
    const mp = bancos[1]!;
    expect(perfilesVisibles(mp, "billetera")).toHaveLength(2);
    expect(perfilesVisibles(mp, "favoritos")).toHaveLength(2);
  });
});
