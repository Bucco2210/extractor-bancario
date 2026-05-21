import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  TIPOS_PLAN,
  CICLOS_FACTURACION,
  ESTADOS_CUENTA,
  PLAN_DEFAULT,
} from "@/lib/planes";

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

/**
 * Estado del plan del usuario. Vive embebido para que las queries más
 * comunes (gate por extracción) sean una sola lectura.
 *
 * - `plan`: tipo actual (trial/plus/pro/premium).
 * - `cicloFacturacion`: mensual o anual (trial siempre "mensual" como
 *   placeholder, el límite real lo controla `cicloFin`).
 * - `cicloInicio` / `cicloFin`: ventana del ciclo en curso. Cuando
 *   `Date.now() > cicloFin`, plan-gate resetea contador y mueve ventana.
 * - `extraccionesEnPeriodo` / `conciliacionesEnPeriodo`: contadores
 *   incrementados al crear, comparados contra `PLANES[plan].limite*`.
 * - `estadoCuenta`: derivable de fechas pero lo persistimos para
 *   responder rápido al gate ("vencida" → modo lectura).
 */
const planSchema = new Schema(
  {
    plan: { type: String, enum: TIPOS_PLAN, default: PLAN_DEFAULT, required: true },
    cicloFacturacion: {
      type: String,
      enum: CICLOS_FACTURACION,
      default: "mensual",
      required: true,
    },
    cicloInicio: { type: Date, default: () => new Date(), required: true },
    cicloFin: { type: Date, required: true },
    extraccionesEnPeriodo: { type: Number, default: 0 },
    conciliacionesEnPeriodo: { type: Number, default: 0 },
    estadoCuenta: {
      type: String,
      enum: ESTADOS_CUENTA,
      default: "activa",
      required: true,
    },
    /** ObjectId del admin que invitó / asignó este plan. Null para el
     *  primer admin del sistema. */
    invitadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
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
    planInfo: { type: planSchema, default: undefined },
  },
  { timestamps: true, collection: "usuarios" },
);

export type UsuarioDoc = InferSchemaType<typeof usuarioSchema> & { _id: mongoose.Types.ObjectId };

export const Usuario: Model<UsuarioDoc> =
  (mongoose.models.Usuario as Model<UsuarioDoc> | undefined) ??
  mongoose.model<UsuarioDoc>("Usuario", usuarioSchema);
