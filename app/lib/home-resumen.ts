import { Types } from "mongoose";
import { Extraccion } from "@/models/Extraccion";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import { Usuario } from "@/models/Usuario";
import { getEnv } from "./env";

export type PerfilResumen = {
  id: string;
  slug: string;
  nombre: string;
  tipoDocumento: string;
  monedaPrimaria: string;
};

export type BancoResumen = {
  entidad: {
    slug: string;
    nombre: string;
    iconoUrl: string | null;
  };
  categoria: "banco" | "billetera";
  perfiles: PerfilResumen[];
  esFavorito: boolean;
  esDestacado: boolean;
  extraccionesDelUsuario: number;
  ordenEnGrid: number;
};

export type UltimoExtractoResumen = {
  id: string;
  banco: string | null;
  entidadSlug: string | null;
  perfilNombre: string | null;
  cuenta: string | null;
  periodo: string | null;
  titular: string | null;
  estado: string;
  movimientosCount: number;
  createdAt: string;
};

export type HomeResumen = {
  bancos: BancoResumen[];
  destacados: string[];
  favoritos: string[];
  ultimos: UltimoExtractoResumen[];
};

/**
 * Arma el resumen de la Home a partir de los perfiles activos, las
 * preferencias del usuario y sus últimas extracciones. Agrupa por
 * `entidad.slug` (una "card" por entidad), conserva el orden visual
 * declarado en `ordenEnGrid` del perfil de menor orden por entidad.
 */
export type PerfilLean = {
  _id: { toString(): string };
  slug: string;
  entidad: { slug: string; nombre: string; iconoUrl?: string | null };
  categoria: string;
  nombre: string;
  tipoDocumento: string;
  monedaPrimaria: string;
  ordenEnGrid?: number;
};

export type ConteoLean = { _id: unknown; count: number };

export type ExtraccionLean = {
  _id: { toString(): string };
  banco?: string | null;
  perfilId?: { toString(): string } | null;
  cuenta?: string | null;
  periodo?: string | null;
  titular?: string | null;
  estado: string;
  movimientos?: unknown[];
  createdAt?: Date;
};

/**
 * Función pura que arma el HomeResumen a partir de los datos crudos.
 * Separada del handler para poder testearla sin mockear Mongo.
 */
export function armarHomeResumen(input: {
  perfiles: PerfilLean[];
  bancosFavoritos: string[];
  bancosDestacados: string[];
  conteoPorPerfil: ConteoLean[];
  ultimosDocs: ExtraccionLean[];
}): HomeResumen {
  const favoritos = new Set(input.bancosFavoritos);
  const destacados = new Set(input.bancosDestacados);

  const conteoPerfilId = new Map<string, number>();
  for (const c of input.conteoPorPerfil) {
    conteoPerfilId.set(String(c._id), c.count);
  }

  const bancosMap = new Map<string, BancoResumen>();

  for (const p of input.perfiles) {
    const slug = p.entidad.slug;
    let banco = bancosMap.get(slug);
    if (!banco) {
      banco = {
        entidad: {
          slug,
          nombre: p.entidad.nombre,
          iconoUrl: p.entidad.iconoUrl ?? null,
        },
        categoria: p.categoria as "banco" | "billetera",
        perfiles: [],
        esFavorito: favoritos.has(slug),
        esDestacado: destacados.has(slug),
        extraccionesDelUsuario: 0,
        ordenEnGrid: p.ordenEnGrid ?? 1000,
      };
      bancosMap.set(slug, banco);
    } else if ((p.ordenEnGrid ?? 1000) < banco.ordenEnGrid) {
      banco.ordenEnGrid = p.ordenEnGrid ?? 1000;
    }
    banco.perfiles.push({
      id: String(p._id),
      slug: p.slug,
      nombre: p.nombre,
      tipoDocumento: p.tipoDocumento,
      monedaPrimaria: p.monedaPrimaria,
    });

    const count = conteoPerfilId.get(String(p._id)) ?? 0;
    banco.extraccionesDelUsuario += count;
  }

  const bancos = Array.from(bancosMap.values()).sort((a, b) => {
    if (a.ordenEnGrid !== b.ordenEnGrid) return a.ordenEnGrid - b.ordenEnGrid;
    return a.entidad.nombre.localeCompare(b.entidad.nombre);
  });

  for (const b of bancos) {
    b.perfiles.sort((x, y) => {
      if (x.tipoDocumento !== y.tipoDocumento) {
        return x.tipoDocumento.localeCompare(y.tipoDocumento);
      }
      return x.nombre.localeCompare(y.nombre);
    });
  }

  const destacadosOrdenados: string[] = [];
  for (const slug of input.bancosDestacados) {
    if (bancosMap.has(slug)) destacadosOrdenados.push(slug);
  }

  const favoritosOrdenados = bancos
    .filter((b) => b.esFavorito)
    .map((b) => b.entidad.slug);

  const perfilById = new Map(
    input.perfiles.map((p) => [
      String(p._id),
      { nombre: p.nombre, entidadSlug: p.entidad.slug },
    ]),
  );
  const ultimos: UltimoExtractoResumen[] = input.ultimosDocs.map((d) => {
    const perfilId = d.perfilId ? String(d.perfilId) : null;
    const perfilInfo = perfilId ? perfilById.get(perfilId) ?? null : null;
    return {
      id: String(d._id),
      banco: d.banco ?? null,
      entidadSlug: perfilInfo?.entidadSlug ?? null,
      perfilNombre: perfilInfo?.nombre ?? null,
      cuenta: d.cuenta ?? null,
      periodo: d.periodo ?? null,
      titular: d.titular ?? null,
      estado: d.estado,
      movimientosCount: (d.movimientos ?? []).length,
      createdAt: (d.createdAt ?? new Date()).toISOString(),
    };
  });

  return {
    bancos,
    destacados: destacadosOrdenados,
    favoritos: favoritosOrdenados,
    ultimos,
  };
}

export async function construirHomeResumen(
  usuarioId: string | Types.ObjectId,
): Promise<HomeResumen> {
  const env = getEnv();
  const usuarioObjId =
    typeof usuarioId === "string" ? new Types.ObjectId(usuarioId) : usuarioId;

  const [perfiles, usuario, conteoPorPerfil, ultimosDocs] = await Promise.all([
    PerfilExtraccion.find({ activo: true })
      .select({
        _id: 1,
        slug: 1,
        entidad: 1,
        categoria: 1,
        nombre: 1,
        tipoDocumento: 1,
        monedaPrimaria: 1,
        ordenEnGrid: 1,
      })
      .lean(),
    Usuario.findById(usuarioObjId)
      .select({ "preferencias.bancosFavoritos": 1 })
      .lean(),
    Extraccion.aggregate([
      { $match: { usuarioId: usuarioObjId, perfilId: { $ne: null } } },
      { $group: { _id: "$perfilId", count: { $sum: 1 } } },
    ]),
    Extraccion.find({ usuarioId: usuarioObjId })
      .sort({ createdAt: -1 })
      .limit(env.HOME_MOSTRAR_ULTIMOS_N)
      .select({
        _id: 1,
        banco: 1,
        perfilId: 1,
        cuenta: 1,
        periodo: 1,
        titular: 1,
        estado: 1,
        movimientos: 1,
        createdAt: 1,
      })
      .lean(),
  ]);

  return armarHomeResumen({
    perfiles: perfiles as unknown as PerfilLean[],
    bancosFavoritos: usuario?.preferencias?.bancosFavoritos ?? [],
    bancosDestacados: env.HOME_BANCOS_DESTACADOS,
    conteoPorPerfil: conteoPorPerfil as ConteoLean[],
    ultimosDocs: ultimosDocs as unknown as ExtraccionLean[],
  });
}
