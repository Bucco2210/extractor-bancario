import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const movimientoSchema = new Schema(
  {
    fecha: { type: String, required: true },
    descripcion: { type: String, required: true },
    referencia: { type: String, default: null },
    debito: { type: Number, default: null },
    credito: { type: Number, default: null },
    saldo: { type: Number, default: null },
  },
  { _id: false },
);

const chunkFallidoSchema = new Schema(
  {
    indice: { type: Number, required: true },
    paginas: { type: [Number], default: [] },
    error: { type: String, required: true },
  },
  { _id: false },
);

const chunkDefinicionSchema = new Schema(
  {
    indice: { type: Number, required: true },
    paginas: { type: [Number], default: [] },
  },
  { _id: false },
);

const metaSchema = new Schema(
  {
    modelo: { type: String, required: true },
    tokensInput: { type: Number, default: 0 },
    tokensOutput: { type: Number, default: 0 },
    tiempoMs: { type: Number, default: 0 },
    paginasTotal: { type: Number, default: 0 },
    chunksTotal: { type: Number, default: 1 },
    chunksOk: { type: Number, default: 0 },
    chunksFallidos: { type: [chunkFallidoSchema], default: [] },
    chunksDefinicion: { type: [chunkDefinicionSchema], default: [] },
    chunksCompletados: { type: [Number], default: [] },
  },
  { _id: false },
);

const archivoSchema = new Schema(
  {
    nombre: { type: String, required: true },
    tamano: { type: Number, required: true },
    contentType: { type: String, required: true },
    blobKey: { type: String, default: null },
    blobUrl: { type: String, default: null },
  },
  { _id: false },
);

const extraccionSchema = new Schema(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    perfilId: { type: Schema.Types.ObjectId, ref: "PerfilExtraccion", default: null },
    banco: { type: String, default: null },
    cuenta: { type: String, default: null },
    periodo: { type: String, default: null },
    titular: { type: String, default: null },
    estado: {
      type: String,
      enum: ["pendiente", "procesando", "extraido", "parcial", "error"],
      default: "extraido",
      required: true,
    },
    movimientos: { type: [movimientoSchema], default: [] },
    archivo: { type: archivoSchema, required: true },
    _meta: { type: metaSchema, required: true },
    error: { type: String, default: null },
  },
  { timestamps: true, collection: "extracciones" },
);

extraccionSchema.index({ usuarioId: 1, createdAt: -1 });

export type ExtraccionDoc = InferSchemaType<typeof extraccionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Extraccion: Model<ExtraccionDoc> =
  (mongoose.models.Extraccion as Model<ExtraccionDoc> | undefined) ??
  mongoose.model<ExtraccionDoc>("Extraccion", extraccionSchema);
