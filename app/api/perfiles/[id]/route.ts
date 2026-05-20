import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol, requerirSesion } from "@/lib/permisos";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import { perfilUpdateSchema } from "@/lib/perfiles-schema";
import { serializarPerfil } from "@/lib/perfiles-serializer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await requerirSesion();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("INPUT_INVALIDO", "ID inválido.");
    }
    await conectarMongoose();
    const doc = await PerfilExtraccion.findById(id).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Perfil no encontrado.");
    return NextResponse.json(serializarPerfil(doc));
  } catch (err) {
    return respuestaError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await requerirRol("admin");
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("INPUT_INVALIDO", "ID inválido.");
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = perfilUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Datos inválidos.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();

    if (parsed.data.slug) {
      const colision = await PerfilExtraccion.exists({
        slug: parsed.data.slug,
        _id: { $ne: id },
      });
      if (colision) {
        throw new AppError(
          "NO_PROCESABLE",
          `Otro perfil ya usa el slug "${parsed.data.slug}".`,
        );
      }
    }

    const doc = await PerfilExtraccion.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Perfil no encontrado.");
    return NextResponse.json(serializarPerfil(doc));
  } catch (err) {
    return respuestaError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await requerirRol("admin");
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("INPUT_INVALIDO", "ID inválido.");
    }
    await conectarMongoose();
    const doc = await PerfilExtraccion.findByIdAndUpdate(
      id,
      { $set: { activo: false } },
      { new: true },
    ).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Perfil no encontrado.");
    return NextResponse.json(serializarPerfil(doc));
  } catch (err) {
    return respuestaError(err);
  }
}
