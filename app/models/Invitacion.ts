import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TIPOS_PLAN, CICLOS_FACTURACION } from "@/lib/planes";

const invitacionSchema = new Schema(
  {
    /** Token aleatorio (64 hex chars). Único, sirve como URL slug. */
    token: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    nombre: { type: String, default: "" },
    /** Plan que recibirá el usuario al aceptar. "trial" por default. */
    planSugerido: { type: String, enum: TIPOS_PLAN, default: "trial", required: true },
    cicloSugerido: {
      type: String,
      enum: CICLOS_FACTURACION,
      default: "mensual",
      required: true,
    },
    expiraEn: { type: Date, required: true, index: true },
    usadaEn: { type: Date, default: null },
    /** Admin que generó la invitación. */
    creadaPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },
    /** Una vez aceptada, ID del usuario creado. */
    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
  },
  { timestamps: true, collection: "invitaciones" },
);

export type InvitacionDoc = InferSchemaType<typeof invitacionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Invitacion: Model<InvitacionDoc> =
  (mongoose.models.Invitacion as Model<InvitacionDoc> | undefined) ??
  mongoose.model<InvitacionDoc>("Invitacion", invitacionSchema);
