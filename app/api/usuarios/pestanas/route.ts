import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { Usuario } from "@/models/Usuario";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pestanaSchema = z.object({
  id: z.string().trim().min(1).max(120),
  extraccionId: z.string().trim().min(1).max(120),
  titulo: z.string().trim().min(1).max(120),
  perfilId: z.string().trim().min(1).max(120).nullable().default(null),
  activa: z.boolean().default(false),
});

const bodySchema = z.object({
  pestanas: z.array(pestanaSchema).max(50),
});

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    await conectarMongoose();
    const u = await Usuario.findById(new Types.ObjectId(session.user.id))
      .select({ "preferencias.pestanasAbiertas": 1 })
      .lean();
    return NextResponse.json({
      pestanas: u?.preferencias?.pestanasAbiertas ?? [],
    });
  } catch (err) {
    return respuestaError(err);
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
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

    const env = getEnv();
    const recortadas = parsed.data.pestanas.slice(0, env.MAX_PESTANAS_ABIERTAS);

    // Garantiza que como máximo una pestaña tenga activa=true.
    let yaHayActiva = false;
    const normalizadas = recortadas.map((p) => {
      if (p.activa && !yaHayActiva) {
        yaHayActiva = true;
        return p;
      }
      return { ...p, activa: false };
    });

    await conectarMongoose();
    await Usuario.updateOne(
      { _id: new Types.ObjectId(session.user.id) },
      { $set: { "preferencias.pestanasAbiertas": normalizadas } },
    );

    return NextResponse.json({
      pestanas: normalizadas,
      recortadas: parsed.data.pestanas.length - normalizadas.length,
      limite: env.MAX_PESTANAS_ABIERTAS,
    });
  } catch (err) {
    return respuestaError(err);
  }
}
