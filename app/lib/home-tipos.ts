export type CategoriaTab = "banco" | "billetera" | "tarjeta" | "favoritos";

export type Perfil = {
  id: string;
  slug: string;
  nombre: string;
  tipoDocumento: string;
  monedaPrimaria: string;
};

export type Banco = {
  entidad: {
    slug: string;
    nombre: string;
    iconoUrl: string | null;
  };
  categoria: "banco" | "billetera";
  perfiles: Perfil[];
  esFavorito: boolean;
  esDestacado: boolean;
  extraccionesDelUsuario: number;
  ordenEnGrid: number;
};

export type UltimoExtracto = {
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
  bancos: Banco[];
  destacados: string[];
  favoritos: string[];
  ultimos: UltimoExtracto[];
};

export type CoincidenciaDeteccion = {
  perfilId: string;
  slug: string;
  score: number;
  razones: string[];
};

export type RespuestaInicioExtraccion = {
  id: string;
  estado: "procesando";
  paginasTotal: number;
  chunksTotal: number;
  perfilId: string | null;
  deteccion: {
    mejor: CoincidenciaDeteccion | null;
    candidatos: CoincidenciaDeteccion[];
    umbral: number;
    auto: boolean;
  } | null;
};

export function bancosVisibles(
  bancos: Banco[],
  tab: CategoriaTab,
): Banco[] {
  if (tab === "favoritos") return bancos.filter((b) => b.esFavorito);
  if (tab === "tarjeta") {
    return bancos.filter((b) =>
      b.perfiles.some(
        (p) =>
          p.tipoDocumento === "tarjeta_credito" ||
          p.tipoDocumento === "tarjeta_debito",
      ),
    );
  }
  return bancos.filter((b) => b.categoria === tab);
}

export function perfilesVisibles(
  banco: Banco,
  tab: CategoriaTab,
): Perfil[] {
  if (tab === "tarjeta") {
    return banco.perfiles.filter(
      (p) =>
        p.tipoDocumento === "tarjeta_credito" ||
        p.tipoDocumento === "tarjeta_debito",
    );
  }
  return banco.perfiles;
}
