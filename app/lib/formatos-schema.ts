import { z } from "zod";
import mongoose from "mongoose";

const objectId = z
  .string()
  .trim()
  .refine((v) => mongoose.isValidObjectId(v), {
    message: "ObjectId inválido",
  });

export const formatoUpdateSchema = z
  .object({
    reglaRegex: z.string().trim().max(10_000).nullable().optional(),
    reglaActiva: z.boolean().optional(),
    notas: z.string().trim().max(2_000).optional(),
    activo: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Hay que actualizar al menos un campo",
  });

export const formatoListQuerySchema = z.object({
  perfilId: objectId.optional(),
  entidad: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/)
    .min(2)
    .max(80)
    .optional(),
  reglaActiva: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  activo: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export const formatoProbarBodySchema = z.object({
  texto: z.string().min(20).max(200_000),
  reglaRegex: z.string().trim().min(1).max(10_000).optional(),
});

export type FormatoUpdateInput = z.infer<typeof formatoUpdateSchema>;
export type FormatoListQuery = z.infer<typeof formatoListQuerySchema>;
export type FormatoProbarInput = z.infer<typeof formatoProbarBodySchema>;
