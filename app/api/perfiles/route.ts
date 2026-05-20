import { NextResponse } from "next/server";
import { z } from "zod";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirRol, requerirSesion } from "@/lib/permisos";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import {
  perfilCreateSchema,
  perfilListQuerySchema,
} from "@/lib/perfiles-schema";
import { serializarPerfil } from "@/lib/perfiles-serializer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requerirSesion();
    const url = new URL(req.url);
    const parsedQuery = perfilListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsedQuery.success) {
      throw new AppError("INPUT_INVALIDO", "Query inválida.", {
        issues: parsedQuery.error.flatten(),
      });
    }
    const q = parsedQuery.data;

    await conectarMongoose();

    const filtro: Record<string, unknown> = {};
    if (q.categoria) filtro.categoria = q.categoria;
    if (q.entidad) filtro["entidad.slug"] = q.entidad;
    if (q.tipoDocumento) filtro.tipoDocumento = q.tipoDocumento;
    if (typeof q.activo === "boolean") filtro.activo = q.activo;
    if (q.q) {
      const regex = new RegExp(escaparRegex(q.q), "i");
      filtro.$or = [
        { slug: regex },
        { nombre: regex },
        { "entidad.nombre": regex },
        { "entidad.slug": regex },
      ];
    }

    const docs = await PerfilExtraccion.find(filtro)
      .sort({ categoria: 1, ordenEnGrid: 1, "entidad.nombre": 1, nombre: 1 })
      .limit(q.limite)
      .lean();

    return NextResponse.json({
      total: docs.length,
      items: docs.map((d) =>
        serializarPerfil({
          ...d,
          createdAt: (d as { createdAt?: Date }).createdAt,
          updatedAt: (d as { updatedAt?: Date }).updatedAt,
        }),
      ),
    });
  } catch (err) {
    return respuestaError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await requerirRol("admin");
    const body = await leerJson(req);
    const parsed = perfilCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Datos inválidos.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();
    const existe = await PerfilExtraccion.exists({ slug: parsed.data.slug });
    if (existe) {
      throw new AppError(
        "NO_PROCESABLE",
        `Ya existe un perfil con slug "${parsed.data.slug}".`,
      );
    }

    const doc = await PerfilExtraccion.create(parsed.data);
    return NextResponse.json(serializarPerfil(doc.toObject()), { status: 201 });
  } catch (err) {
    return respuestaError(err);
  }
}

async function leerJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
  }
}

function escaparRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Re-exporto el schema para tipar el body en pruebas.
export type { z };
