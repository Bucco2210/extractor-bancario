import type { PerfilExtraccionDoc } from "@/models/PerfilExtraccion";

export type PerfilDTO = {
  id: string;
  slug: string;
  entidad: {
    slug: string;
    nombre: string;
    iconoUrl: string | null;
  };
  categoria: string;
  nombre: string;
  tipoDocumento: string;
  monedaPrimaria: string;
  promptSistema: string;
  huella: { palabrasClave: string[] };
  validacionesEspeciales: Array<{
    tipo: string;
    valor: string;
    descripcion: string | null;
  }>;
  ordenEnGrid: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

type LeanPerfil = Pick<
  PerfilExtraccionDoc,
  | "_id"
  | "slug"
  | "entidad"
  | "categoria"
  | "nombre"
  | "tipoDocumento"
  | "monedaPrimaria"
  | "promptSistema"
  | "huella"
  | "validacionesEspeciales"
  | "ordenEnGrid"
  | "activo"
> & { createdAt?: Date; updatedAt?: Date };

export function serializarPerfil(doc: LeanPerfil): PerfilDTO {
  return {
    id: String(doc._id),
    slug: doc.slug,
    entidad: {
      slug: doc.entidad.slug,
      nombre: doc.entidad.nombre,
      iconoUrl: doc.entidad.iconoUrl ?? null,
    },
    categoria: doc.categoria,
    nombre: doc.nombre,
    tipoDocumento: doc.tipoDocumento,
    monedaPrimaria: doc.monedaPrimaria,
    promptSistema: doc.promptSistema ?? "",
    huella: { palabrasClave: doc.huella?.palabrasClave ?? [] },
    validacionesEspeciales: (doc.validacionesEspeciales ?? []).map((v) => ({
      tipo: v.tipo,
      valor: v.valor,
      descripcion: v.descripcion ?? null,
    })),
    ordenEnGrid: doc.ordenEnGrid ?? 100,
    activo: doc.activo,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}
