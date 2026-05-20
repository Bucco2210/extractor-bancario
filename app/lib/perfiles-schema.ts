import { z } from "zod";
import {
  CATEGORIAS_PERFIL,
  MONEDAS_PERFIL,
  TIPOS_DOCUMENTO,
  TIPOS_VALIDACION,
} from "@/models/PerfilExtraccion";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9_]+$/, "Slug solo acepta minúsculas, números y guion bajo");

const entidadSchema = z.object({
  slug: slugSchema,
  nombre: z.string().trim().min(2).max(80),
  iconoUrl: z.string().url().max(500).nullable().optional().default(null),
});

const huellaSchema = z
  .object({
    palabrasClave: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  })
  .default({ palabrasClave: [] });

const validacionSchema = z.object({
  tipo: z.enum(TIPOS_VALIDACION),
  valor: z.string().trim().min(1).max(500),
  descripcion: z.string().trim().max(300).nullable().optional().default(null),
});

export const perfilCreateSchema = z.object({
  slug: slugSchema,
  entidad: entidadSchema,
  categoria: z.enum(CATEGORIAS_PERFIL),
  nombre: z.string().trim().min(2).max(120),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO),
  monedaPrimaria: z.enum(MONEDAS_PERFIL),
  promptSistema: z.string().max(8000).optional().default(""),
  huella: huellaSchema,
  validacionesEspeciales: z.array(validacionSchema).max(50).optional().default([]),
  ordenEnGrid: z.number().int().min(0).max(10_000).optional().default(100),
  activo: z.boolean().optional().default(true),
});

export const perfilUpdateSchema = perfilCreateSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  { message: "Hay que actualizar al menos un campo" },
);

export const perfilListQuerySchema = z.object({
  categoria: z.enum(CATEGORIAS_PERFIL).optional(),
  entidad: slugSchema.optional(),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO).optional(),
  activo: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export type PerfilCreateInput = z.infer<typeof perfilCreateSchema>;
export type PerfilUpdateInput = z.infer<typeof perfilUpdateSchema>;
export type PerfilListQuery = z.infer<typeof perfilListQuerySchema>;
