import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const CATEGORIAS_PERFIL = ["banco", "billetera"] as const;
export type CategoriaPerfil = (typeof CATEGORIAS_PERFIL)[number];

export const TIPOS_DOCUMENTO = [
  "extracto_bancario",
  "tarjeta_credito",
  "tarjeta_debito",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const MONEDAS_PERFIL = ["ARS", "USD"] as const;
export type MonedaPerfil = (typeof MONEDAS_PERFIL)[number];

export const TIPOS_VALIDACION = [
  "moneda_obligatoria",
  "encabezado_obligatorio",
  "palabra_clave_prohibida",
  "regex_match",
] as const;
export type TipoValidacion = (typeof TIPOS_VALIDACION)[number];

const entidadSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    iconoUrl: { type: String, default: null },
  },
  { _id: false },
);

const huellaSchema = new Schema(
  {
    palabrasClave: { type: [String], default: [] },
  },
  { _id: false },
);

const validacionSchema = new Schema(
  {
    tipo: { type: String, enum: TIPOS_VALIDACION, required: true },
    valor: { type: String, required: true },
    descripcion: { type: String, default: null },
  },
  { _id: false },
);

const perfilSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    entidad: { type: entidadSchema, required: true },
    categoria: { type: String, enum: CATEGORIAS_PERFIL, required: true },
    nombre: { type: String, required: true, trim: true },
    tipoDocumento: { type: String, enum: TIPOS_DOCUMENTO, required: true },
    monedaPrimaria: { type: String, enum: MONEDAS_PERFIL, required: true },
    promptSistema: { type: String, default: "" },
    huella: { type: huellaSchema, default: () => ({ palabrasClave: [] }) },
    validacionesEspeciales: { type: [validacionSchema], default: [] },
    ordenEnGrid: { type: Number, default: 100 },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "perfilesExtraccion" },
);

perfilSchema.index({ "entidad.slug": 1, tipoDocumento: 1 });
perfilSchema.index({ categoria: 1, activo: 1, ordenEnGrid: 1 });

export type PerfilExtraccionDoc = InferSchemaType<typeof perfilSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PerfilExtraccion: Model<PerfilExtraccionDoc> =
  (mongoose.models.PerfilExtraccion as Model<PerfilExtraccionDoc> | undefined) ??
  mongoose.model<PerfilExtraccionDoc>("PerfilExtraccion", perfilSchema);
