import { NextResponse } from "next/server";
import { conectarMongoose } from "@/lib/mongo";
import { respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { construirHomeResumen } from "@/lib/home-resumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    await conectarMongoose();
    const resumen = await construirHomeResumen(session.user.id);
    return NextResponse.json(resumen);
  } catch (err) {
    return respuestaError(err);
  }
}
