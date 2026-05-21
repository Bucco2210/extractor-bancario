import { z } from "zod";
import { TIPOS_PLAN, CICLOS_FACTURACION, ESTADOS_CUENTA } from "@/lib/planes";

const emailSchema = z.string().trim().toLowerCase().email().max(200);

export const invitarBodySchema = z.object({
  email: emailSchema,
  nombre: z.string().trim().max(120).optional().default(""),
  planSugerido: z.enum(TIPOS_PLAN).optional().default("trial"),
  cicloSugerido: z.enum(CICLOS_FACTURACION).optional().default("mensual"),
  /** Días que dura la invitación antes de expirar. Default 7. */
  diasValidez: z.number().int().min(1).max(60).optional().default(7),
});

export const aceptarInvitacionSchema = z.object({
  token: z.string().trim().length(64),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(120),
  nombre: z.string().trim().min(1).max(120).optional(),
});

export const patchUsuarioSchema = z
  .object({
    plan: z.enum(TIPOS_PLAN).optional(),
    cicloFacturacion: z.enum(CICLOS_FACTURACION).optional(),
    estadoCuenta: z.enum(ESTADOS_CUENTA).optional(),
    activo: z.boolean().optional(),
    rol: z.enum(["admin", "operador"]).optional(),
    /** Reiniciar el contador del ciclo manualmente. */
    resetCiclo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Hay que actualizar al menos un campo.",
  });

export const crearPagoSchema = z.object({
  usuarioId: z.string().trim().length(24),
  plan: z.enum(TIPOS_PLAN),
  cicloFacturacion: z.enum(CICLOS_FACTURACION),
  monto: z.number().positive(),
  moneda: z.string().trim().length(3).default("USD"),
  notas: z.string().trim().max(500).optional().default(""),
});

export const adminUsuariosListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  plan: z.enum(TIPOS_PLAN).optional(),
  estadoCuenta: z.enum(ESTADOS_CUENTA).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export type InvitarBody = z.infer<typeof invitarBodySchema>;
export type AceptarInvitacionBody = z.infer<typeof aceptarInvitacionSchema>;
export type PatchUsuarioBody = z.infer<typeof patchUsuarioSchema>;
export type CrearPagoBody = z.infer<typeof crearPagoSchema>;
export type AdminUsuariosListQuery = z.infer<
  typeof adminUsuariosListQuerySchema
>;
