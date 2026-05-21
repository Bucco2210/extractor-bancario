import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TIPOS_PLAN, CICLOS_FACTURACION } from "@/lib/planes";

export const FUENTES_PAGO = ["manual", "mercadopago"] as const;
export type FuentePago = (typeof FUENTES_PAGO)[number];

export const ESTADOS_PAGO = [
  "pendiente",
  "confirmado",
  "rechazado",
  "reembolsado",
] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

const pagoSchema = new Schema(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },
    /** Plan que paga este pago. Snapshot del momento, no lookup. */
    plan: { type: String, enum: TIPOS_PLAN, required: true },
    cicloFacturacion: {
      type: String,
      enum: CICLOS_FACTURACION,
      required: true,
    },
    monto: { type: Number, required: true },
    moneda: { type: String, default: "USD", required: true },
    /** Período cubierto por el pago (ventana resultante en Usuario.planInfo). */
    periodoInicio: { type: Date, required: true },
    periodoFin: { type: Date, required: true },
    estado: {
      type: String,
      enum: ESTADOS_PAGO,
      default: "confirmado",
      required: true,
    },
    fuente: { type: String, enum: FUENTES_PAGO, default: "manual", required: true },
    /** ID de Mercado Pago cuando fuente="mercadopago". Null si manual. */
    mpPaymentId: { type: String, default: null },
    /** Notas internas del admin (ej: "transferencia recibida 21/05"). */
    notas: { type: String, default: "" },
    /** Admin que registró el pago manualmente. Null si webhook. */
    registradoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
    fechaConfirmacion: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: "pagos" },
);

pagoSchema.index({ usuarioId: 1, createdAt: -1 });
pagoSchema.index({ fuente: 1, mpPaymentId: 1 }, { sparse: true });

export type PagoDoc = InferSchemaType<typeof pagoSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Pago: Model<PagoDoc> =
  (mongoose.models.Pago as Model<PagoDoc> | undefined) ??
  mongoose.model<PagoDoc>("Pago", pagoSchema);
