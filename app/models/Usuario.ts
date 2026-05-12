import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type RolUsuario = "admin" | "operador";

const preferenciasSchema = new Schema(
  {
    perfilFavorito: { type: String, default: null },
    bancosFavoritos: { type: [String], default: [] },
    pestanasAbiertas: {
      type: [
        {
          id: { type: String, required: true },
          extraccionId: { type: String, default: null },
          titulo: { type: String, required: true },
          perfilId: { type: String, default: null },
          activa: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const usuarioSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    rol: { type: String, enum: ["admin", "operador"], default: "operador", required: true },
    activo: { type: Boolean, default: true },
    preferencias: { type: preferenciasSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "usuarios" },
);

export type UsuarioDoc = InferSchemaType<typeof usuarioSchema> & { _id: mongoose.Types.ObjectId };

export const Usuario: Model<UsuarioDoc> =
  (mongoose.models.Usuario as Model<UsuarioDoc> | undefined) ??
  mongoose.model<UsuarioDoc>("Usuario", usuarioSchema);
