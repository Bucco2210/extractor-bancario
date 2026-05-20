import { z } from "zod";
import mongoose from "mongoose";

const objectId = z
  .string()
  .trim()
  .refine((v) => mongoose.isValidObjectId(v), {
    message: "ObjectId inválido",
  });

export const conciliacionListQuerySchema = z.object({
  extraccionId: objectId.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
});

export const tolerancesSchema = z.object({
  dias: z.number().int().min(0).max(60),
  importe: z.number().min(0).max(100_000),
  fuzzyUmbral: z.number().min(0).max(1),
});

export const mapeoColumnasSchema = z.object({
  fecha: z.string().trim().min(1).max(120).nullable(),
  descripcion: z.string().trim().min(1).max(120).nullable(),
  monto: z.string().trim().min(1).max(120).nullable(),
  referencia: z.string().trim().min(1).max(120).nullable().optional().default(null),
});

export const conciliacionPatchSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    notas: z.string().trim().max(2_000).optional(),
    tolerancias: tolerancesSchema.optional(),
    /** Forzar match manual: extractoIdx → registroIdx. Si el registro
     *  ya está asignado a otro extractoIdx, se libera. */
    forzarMatch: z
      .object({
        extractoIdx: z.number().int().min(0),
        registroIdx: z.number().int().min(0),
      })
      .optional(),
    /** Quitar el match del movimiento del extracto (si tenía). */
    quitarMatch: z
      .object({ extractoIdx: z.number().int().min(0) })
      .optional(),
    /** Marcar / desmarcar movimiento del extracto como "descartado"
     *  (no se computa como huérfano). */
    descartarExtracto: z
      .object({
        extractoIdx: z.number().int().min(0),
        descartar: z.boolean(),
      })
      .optional(),
    /** Crear un grupo manual (sumatoria de cobranzas contra un
     *  movimiento, o viceversa). Saca de matches y descartados los
     *  índices que entren al grupo. */
    crearGrupoManual: z
      .object({
        extractoIdxs: z
          .array(z.number().int().min(0))
          .min(1, "Tiene que tener al menos un movimiento del extracto."),
        registroIdxs: z
          .array(z.number().int().min(0))
          .min(1, "Tiene que tener al menos un registro de la segunda fuente."),
        nota: z.string().trim().max(500).optional().default(""),
      })
      .refine(
        (g) =>
          new Set(g.extractoIdxs).size === g.extractoIdxs.length &&
          new Set(g.registroIdxs).size === g.registroIdxs.length,
        { message: "Los índices del grupo no pueden repetirse." },
      )
      .optional(),
    /** Eliminar un grupo manual por su índice en el array. */
    eliminarGrupoManual: z
      .object({ indice: z.number().int().min(0) })
      .optional(),
    /** Volver a correr el matcheo automático con las tolerancias
     *  actuales (o las que se mandan en el mismo body). */
    reMatchear: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Hay que enviar al menos un cambio",
  });

export type ConciliacionListQuery = z.infer<typeof conciliacionListQuerySchema>;
export type ConciliacionPatchInput = z.infer<typeof conciliacionPatchSchema>;
export type ToleranciesInput = z.infer<typeof tolerancesSchema>;
export type MapeoColumnasInput = z.infer<typeof mapeoColumnasSchema>;
