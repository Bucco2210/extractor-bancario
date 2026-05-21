import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol } from "@/lib/permisos";
import { Invitacion } from "@/models/Invitacion";
import { Usuario } from "@/models/Usuario";
import { invitarBodySchema } from "@/lib/admin-schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await requerirRol("admin");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = invitarBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }
    const { email, nombre, planSugerido, cicloSugerido, diasValidez } =
      parsed.data;

    await conectarMongoose();

    // Si ya existe un usuario con ese email, no creo invitación.
    const yaExiste = await Usuario.exists({ email });
    if (yaExiste) {
      throw new AppError(
        "NO_PROCESABLE",
        `Ya existe un usuario con email ${email}.`,
      );
    }

    const token = randomBytes(32).toString("hex"); // 64 chars hex
    const expiraEn = new Date(Date.now() + diasValidez * 24 * 60 * 60 * 1000);

    const inv = await Invitacion.create({
      token,
      email,
      nombre,
      planSugerido,
      cicloSugerido,
      expiraEn,
      creadaPor: new Types.ObjectId(session.user.id),
    });

    logger.info(
      {
        invitacionId: String(inv._id),
        email,
        planSugerido,
        expiraEn: expiraEn.toISOString(),
      },
      "[admin] invitación creada",
    );

    return NextResponse.json(
      {
        id: String(inv._id),
        token,
        email,
        planSugerido,
        cicloSugerido,
        expiraEn: expiraEn.toISOString(),
        // URL que el admin manda al invitado.
        link: `/registro/${token}`,
      },
      { status: 201 },
    );
  } catch (err) {
    return respuestaError(err);
  }
}
