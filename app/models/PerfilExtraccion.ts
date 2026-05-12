import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Stub mínimo de PerfilExtraccion. Se expande completo en Fase 2
 * (con prompts por banco/producto, validaciones, etc.).
 */
const perfilSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    categoria: {
      type: String,
      enum: ["banco", "billetera", "tarjeta"],
      required: true,
    },
    producto: {
      type: String,
      enum: ["caja_ahorro_ars", "cta_cte_ars", "caja_ahorro_usd", "tarjeta", "general"],
      default: "general",
    },
    promptSistema: { type: String, default: "" },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "perfilesExtraccion" },
);

export type PerfilExtraccionDoc = InferSchemaType<typeof perfilSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PerfilExtraccion: Model<PerfilExtraccionDoc> =
  (mongoose.models.PerfilExtraccion as Model<PerfilExtraccionDoc> | undefined) ??
  mongoose.model<PerfilExtraccionDoc>("PerfilExtraccion", perfilSchema);
