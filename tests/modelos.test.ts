import { describe, it, expect } from "vitest";
import { Conciliacion } from "../app/models/Conciliacion";
import { FormatoAprendido } from "../app/models/FormatoAprendido";
import { Extraccion } from "../app/models/Extraccion";
import { Usuario } from "../app/models/Usuario";
import { PerfilExtraccion } from "../app/models/PerfilExtraccion";

describe("modelos Mongoose registrados", () => {
  it("Conciliacion tiene los paths esperados", () => {
    const paths = Conciliacion.schema.paths;
    expect(paths).toHaveProperty("usuarioId");
    expect(paths).toHaveProperty("extraccionId");
    expect(paths).toHaveProperty("nombre");
    expect(paths).toHaveProperty("estado");
    expect(paths).toHaveProperty("segundaFuente");
    expect(paths).toHaveProperty("matches");
    expect(paths).toHaveProperty("gruposManuales");
    expect(paths).toHaveProperty("estadisticas");
  });

  it("Conciliacion tiene índice usuarioId+createdAt", () => {
    const indexes = Conciliacion.schema.indexes();
    const tiene = indexes.some(
      ([def]) =>
        (def as Record<string, number>).usuarioId === 1 &&
        (def as Record<string, number>).createdAt === -1,
    );
    expect(tiene).toBe(true);
  });

  it("FormatoAprendido tiene paths esperados", () => {
    const paths = FormatoAprendido.schema.paths;
    expect(paths).toHaveProperty("perfilId");
    expect(paths).toHaveProperty("huella");
    expect(paths).toHaveProperty("reglaRegex");
    expect(paths).toHaveProperty("reglaActiva");
    expect(paths).toHaveProperty("stats");
  });

  it("FormatoAprendido marca huella como unique", () => {
    const huellaPath = FormatoAprendido.schema.path("huella");
    expect(huellaPath).toBeDefined();
    expect((huellaPath as unknown as { options: { unique: boolean } }).options.unique).toBe(true);
  });

  it("Extraccion tiene enum de estado correcto", () => {
    const estadoPath = Extraccion.schema.path("estado");
    const enumValues = (estadoPath as unknown as {
      enumValues: string[];
    }).enumValues;
    expect(enumValues).toEqual([
      "pendiente",
      "procesando",
      "extraido",
      "parcial",
      "error",
    ]);
  });

  it("Extraccion tiene fuente con enum [regla, openai]", () => {
    const fuentePath = Extraccion.schema.path("fuente");
    const enumValues = (fuentePath as unknown as {
      enumValues: string[];
    }).enumValues;
    expect(enumValues).toEqual(["regla", "openai"]);
  });

  it("Usuario tiene email único", () => {
    const emailPath = Usuario.schema.path("email");
    expect((emailPath as unknown as { options: { unique: boolean } }).options.unique).toBe(true);
  });

  it("Usuario tiene rol con enum admin/operador", () => {
    const rolPath = Usuario.schema.path("rol");
    const enumValues = (rolPath as unknown as { enumValues: string[] })
      .enumValues;
    expect(enumValues).toEqual(["admin", "operador"]);
  });

  it("PerfilExtraccion expone modelo", () => {
    expect(PerfilExtraccion.modelName).toBe("PerfilExtraccion");
  });
});
