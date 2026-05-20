import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const statsSchema = new Schema(
  {
    extraccionesOk: { type: Number, default: 0 },
    extraccionesFallidas: { type: Number, default: 0 },
    extraccionesIA: { type: Number, default: 0 },
    primerUso: { type: Date, default: null },
    ultimoUso: { type: Date, default: null },
  },
  { _id: false },
);

const formatoSchema = new Schema(
  {
    perfilId: {
      type: Schema.Types.ObjectId,
      ref: "PerfilExtraccion",
      required: true,
      index: true,
    },
    huella: { type: String, required: true, unique: true, index: true },
    resumenHuella: { type: String, default: "" },
    reglaRegex: { type: String, default: null },
    reglaActiva: { type: Boolean, default: false },
    stats: { type: statsSchema, default: () => ({}) },
    notas: { type: String, default: "" },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "formatosAprendidos" },
);

formatoSchema.index({ perfilId: 1, reglaActiva: 1 });

export type FormatoAprendidoDoc = InferSchemaType<typeof formatoSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormatoAprendido: Model<FormatoAprendidoDoc> =
  (mongoose.models.FormatoAprendido as Model<FormatoAprendidoDoc> | undefined) ??
  mongoose.model<FormatoAprendidoDoc>("FormatoAprendido", formatoSchema);
