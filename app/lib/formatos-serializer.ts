import type { FormatoAprendidoDoc } from "@/models/FormatoAprendido";

export type FormatoDTO = {
  id: string;
  perfilId: string;
  huella: string;
  resumenHuella: string;
  reglaRegex: string | null;
  reglaActiva: boolean;
  stats: {
    extraccionesOk: number;
    extraccionesFallidas: number;
    extraccionesIA: number;
    primerUso: string | null;
    ultimoUso: string | null;
  };
  notas: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

type LeanFormato = Pick<
  FormatoAprendidoDoc,
  | "_id"
  | "perfilId"
  | "huella"
  | "resumenHuella"
  | "reglaRegex"
  | "reglaActiva"
  | "stats"
  | "notas"
  | "activo"
> & { createdAt?: Date; updatedAt?: Date };

export function serializarFormato(doc: LeanFormato): FormatoDTO {
  return {
    id: String(doc._id),
    perfilId: String(doc.perfilId),
    huella: doc.huella,
    resumenHuella: doc.resumenHuella ?? "",
    reglaRegex: doc.reglaRegex ?? null,
    reglaActiva: doc.reglaActiva,
    stats: {
      extraccionesOk: doc.stats?.extraccionesOk ?? 0,
      extraccionesFallidas: doc.stats?.extraccionesFallidas ?? 0,
      extraccionesIA: doc.stats?.extraccionesIA ?? 0,
      primerUso: doc.stats?.primerUso
        ? new Date(doc.stats.primerUso).toISOString()
        : null,
      ultimoUso: doc.stats?.ultimoUso
        ? new Date(doc.stats.ultimoUso).toISOString()
        : null,
    },
    notas: doc.notas ?? "",
    activo: doc.activo,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}
