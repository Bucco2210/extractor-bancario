import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ESTADOS_CONCILIACION = ["pendiente", "completada"] as const;
export type EstadoConciliacion = (typeof ESTADOS_CONCILIACION)[number];

export const FORMATOS_SEGUNDA_FUENTE = ["csv", "xlsx"] as const;
export type FormatoSegundaFuente = (typeof FORMATOS_SEGUNDA_FUENTE)[number];

const registroSchema = new Schema(
  {
    idx: { type: Number, required: true },
    fecha: { type: String, default: null }, // DD/MM/YYYY
    descripcion: { type: String, default: "" },
    monto: { type: Number, default: null }, // signo según fuente
    referencia: { type: String, default: null },
  },
  { _id: false },
);

const mapeoColumnasSchema = new Schema(
  {
    fecha: { type: String, default: null },
    descripcion: { type: String, default: null },
    monto: { type: String, default: null },
    referencia: { type: String, default: null },
  },
  { _id: false },
);

const segundaFuenteSchema = new Schema(
  {
    archivoNombre: { type: String, required: true },
    formato: { type: String, enum: FORMATOS_SEGUNDA_FUENTE, required: true },
    registros: { type: [registroSchema], default: [] },
    mapeoColumnas: { type: mapeoColumnasSchema, required: true },
    headersOriginales: { type: [String], default: [] },
  },
  { _id: false },
);

const tolerancesSchema = new Schema(
  {
    dias: { type: Number, default: 2 },
    importe: { type: Number, default: 1 },
    fuzzyUmbral: { type: Number, default: 0.85 },
  },
  { _id: false },
);

const criteriosSchema = new Schema(
  {
    fecha: { type: Number, default: 0 },
    importe: { type: Number, default: 0 },
    descripcion: { type: Number, default: 0 },
  },
  { _id: false },
);

const matchSchema = new Schema(
  {
    extractoIdx: { type: Number, required: true },
    registroIdx: { type: Number, required: true },
    score: { type: Number, required: true },
    criterios: { type: criteriosSchema, default: () => ({}) },
    confirmadoManualmente: { type: Boolean, default: false },
  },
  { _id: false },
);

const estadisticasSchema = new Schema(
  {
    totalExtracto: { type: Number, default: 0 },
    totalSegundaFuente: { type: Number, default: 0 },
    matcheados: { type: Number, default: 0 },
    huerfanosExtracto: { type: Number, default: 0 },
    huerfanosSegundaFuente: { type: Number, default: 0 },
    enGruposManuales: { type: Number, default: 0 },
  },
  { _id: false },
);

const grupoManualSchema = new Schema(
  {
    extractoIdxs: { type: [Number], default: [] },
    registroIdxs: { type: [Number], default: [] },
    nota: { type: String, default: "" },
    creadoEn: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conciliacionSchema = new Schema(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },
    extraccionId: {
      type: Schema.Types.ObjectId,
      ref: "Extraccion",
      required: true,
      index: true,
    },
    nombre: { type: String, required: true, trim: true },
    estado: {
      type: String,
      enum: ESTADOS_CONCILIACION,
      default: "completada",
      required: true,
    },
    segundaFuente: { type: segundaFuenteSchema, required: true },
    tolerancias: { type: tolerancesSchema, required: true },
    matches: { type: [matchSchema], default: [] },
    /** Índices del extracto que el usuario marcó como "ignorar" (no
     *  cuenta como huérfano en el resumen). */
    descartadosExtracto: { type: [Number], default: [] },
    /** Agrupaciones manuales 1:N o N:1 (ej. una transferencia bancaria
     *  que cubre varias cobranzas). Los índices listados acá no se
     *  consideran huérfanos ni se re-matchean. */
    gruposManuales: { type: [grupoManualSchema], default: [] },
    estadisticas: { type: estadisticasSchema, default: () => ({}) },
    notas: { type: String, default: "" },
  },
  { timestamps: true, collection: "conciliaciones" },
);

conciliacionSchema.index({ usuarioId: 1, createdAt: -1 });

export type ConciliacionDoc = InferSchemaType<typeof conciliacionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Conciliacion: Model<ConciliacionDoc> =
  (mongoose.models.Conciliacion as Model<ConciliacionDoc> | undefined) ??
  mongoose.model<ConciliacionDoc>("Conciliacion", conciliacionSchema);
