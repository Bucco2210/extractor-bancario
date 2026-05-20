import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { Usuario } from "@/models/Usuario";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9_]+$/);

const bodySchema = z.object({ entidadSlug: slugSchema });

async function validarEntidad(entidadSlug: string): Promise<void> {
  const existe = await PerfilExtraccion.exists({
    "entidad.slug": entidadSlug,
    activo: true,
  });
  if (!existe) {
    throw new AppError(
      "NO_ENCONTRADO",
      `No existe ninguna entidad activa con slug "${entidadSlug}".`,
    );
  }
}

async function leerFavoritos(usuarioId: string): Promise<string[]> {
  const u = await Usuario.findById(new Types.ObjectId(usuarioId))
    .select({ "preferencias.bancosFavoritos": 1 })
    .lean();
  return u?.preferencias?.bancosFavoritos ?? [];
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await requerirSesion();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();
    await validarEntidad(parsed.data.entidadSlug);

    await Usuario.updateOne(
      { _id: new Types.ObjectId(session.user.id) },
      { $addToSet: { "preferencias.bancosFavoritos": parsed.data.entidadSlug } },
    );

    const favoritos = await leerFavoritos(session.user.id);
    return NextResponse.json({ favoritos }, { status: 200 });
  } catch (err) {
    return respuestaError(err);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const session = await requerirSesion();

    const url = new URL(req.url);
    const raw = url.searchParams.get("entidadSlug");
    const parsed = slugSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        "INPUT_INVALIDO",
        "Falta o es inválido el query param 'entidadSlug'.",
      );
    }

    await conectarMongoose();

    await Usuario.updateOne(
      { _id: new Types.ObjectId(session.user.id) },
      { $pull: { "preferencias.bancosFavoritos": parsed.data } },
    );

    const favoritos = await leerFavoritos(session.user.id);
    return NextResponse.json({ favoritos }, { status: 200 });
  } catch (err) {
    return respuestaError(err);
  }
}
