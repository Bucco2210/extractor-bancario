import { NextResponse } from "next/server";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { Invitacion } from "@/models/Invitacion";
import { Usuario } from "@/models/Usuario";
import { aceptarInvitacionSchema } from "@/lib/admin-schemas";
import { hashearPassword } from "@/lib/password";
import { calcularFinCiclo } from "@/lib/planes";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint público — un invitado consume el token, setea password y
 * queda creado como usuario operador con el planInfo definido por la
 * invitación.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = aceptarInvitacionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }
    const { token, password, nombre } = parsed.data;

    await conectarMongoose();

    const inv = await Invitacion.findOne({ token });
    if (!inv) {
      throw new AppError("NO_ENCONTRADO", "Invitación no encontrada.");
    }
    if (inv.usadaEn) {
      throw new AppError("NO_PROCESABLE", "Esta invitación ya fue usada.");
    }
    if (inv.expiraEn.getTime() < Date.now()) {
      throw new AppError("NO_PROCESABLE", "Esta invitación ya venció.");
    }

    // Si en el intervalo entre invitar y aceptar, alguien creó un usuario
    // con ese email manualmente, no piso.
    const yaExiste = await Usuario.exists({ email: inv.email });
    if (yaExiste) {
      throw new AppError(
        "NO_PROCESABLE",
        "Ya existe un usuario con ese email. Pedile al admin que te resetee el password.",
      );
    }

    const passwordHash = await hashearPassword(password);
    const inicio = new Date();
    const fin = calcularFinCiclo(inv.planSugerido, inv.cicloSugerido, inicio);

    const usuario = await Usuario.create({
      email: inv.email,
      nombre: nombre ?? inv.nombre ?? inv.email,
      passwordHash,
      rol: "operador",
      activo: true,
      planInfo: {
        plan: inv.planSugerido,
        cicloFacturacion: inv.cicloSugerido,
        cicloInicio: inicio,
        cicloFin: fin,
        extraccionesEnPeriodo: 0,
        conciliacionesEnPeriodo: 0,
        estadoCuenta: "activa",
        invitadoPor: inv.creadaPor,
      },
    });

    inv.usadaEn = new Date();
    inv.usuarioId = usuario._id;
    await inv.save();

    logger.info(
      {
        usuarioId: String(usuario._id),
        invitacionId: String(inv._id),
        plan: inv.planSugerido,
      },
      "[auth] invitación aceptada",
    );

    return NextResponse.json(
      {
        id: String(usuario._id),
        email: usuario.email,
        plan: inv.planSugerido,
        cicloFin: fin.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    return respuestaError(err);
  }
}
