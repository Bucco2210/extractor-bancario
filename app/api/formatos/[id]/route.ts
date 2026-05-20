import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol, requerirSesion } from "@/lib/permisos";
import { FormatoAprendido } from "@/models/FormatoAprendido";
import { formatoUpdateSchema } from "@/lib/formatos-schema";
import { serializarFormato } from "@/lib/formatos-serializer";

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
    const doc = await FormatoAprendido.findById(id).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Formato no encontrado.");
    return NextResponse.json(serializarFormato(doc));
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
    const parsed = formatoUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Datos inválidos.", {
        issues: parsed.error.flatten(),
      });
    }

    // Si activa la regla, exige que reglaRegex no sea null/vacío.
    const reglaActivaFinal = parsed.data.reglaActiva ?? undefined;
    if (reglaActivaFinal === true) {
      const reglaTexto = parsed.data.reglaRegex;
      if (reglaTexto === null) {
        throw new AppError(
          "INPUT_INVALIDO",
          "No podés activar la regla sin un regex.",
        );
      }
      // Si no se está mandando reglaRegex en este PATCH, hay que validar
      // contra el doc existente.
      if (reglaTexto === undefined) {
        await conectarMongoose();
        const doc = await FormatoAprendido.findById(id)
          .select({ reglaRegex: 1 })
          .lean();
        if (!doc?.reglaRegex) {
          throw new AppError(
            "INPUT_INVALIDO",
            "No podés activar la regla sin un regex guardado.",
          );
        }
      }
    }

    if (typeof parsed.data.reglaRegex === "string") {
      try {
        new RegExp(parsed.data.reglaRegex);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "regex inválido";
        throw new AppError("INPUT_INVALIDO", `Regex inválido: ${msg}`);
      }
    }

    await conectarMongoose();
    const doc = await FormatoAprendido.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Formato no encontrado.");
    return NextResponse.json(serializarFormato(doc));
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
    const doc = await FormatoAprendido.findByIdAndUpdate(
      id,
      { $set: { activo: false, reglaActiva: false } },
      { new: true },
    ).lean();
    if (!doc) throw new AppError("NO_ENCONTRADO", "Formato no encontrado.");
    return NextResponse.json(serializarFormato(doc));
  } catch (err) {
    return respuestaError(err);
  }
}
