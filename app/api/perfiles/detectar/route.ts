import { NextResponse } from "next/server";
import { z } from "zod";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { PerfilExtraccion } from "@/models/PerfilExtraccion";
import {
  detectarPerfil,
  type CandidatoPerfil,
} from "@/lib/detector-perfil";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  texto: z.string().min(50, "El texto debe tener al menos 50 caracteres."),
  topN: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await requerirSesion();

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
    const docs = await PerfilExtraccion.find({ activo: true })
      .select({
        _id: 1,
        slug: 1,
        entidad: 1,
        nombre: 1,
        categoria: 1,
        tipoDocumento: 1,
        monedaPrimaria: 1,
        huella: 1,
      })
      .lean();

    if (docs.length === 0) {
      throw new AppError(
        "NO_PROCESABLE",
        "No hay perfiles activos para usar como candidatos.",
      );
    }

    const candidatos: CandidatoPerfil[] = docs.map((d) => ({
      id: String(d._id),
      slug: d.slug,
      nombreEntidad: d.entidad.nombre,
      nombre: d.nombre,
      categoria: d.categoria,
      tipoDocumento: d.tipoDocumento,
      monedaPrimaria: d.monedaPrimaria,
      palabrasClave: d.huella?.palabrasClave ?? [],
    }));

    const t0 = Date.now();
    const resultado = await detectarPerfil({
      texto: parsed.data.texto,
      candidatos,
      topN: parsed.data.topN,
    });
    logger.info(
      {
        candidatos: candidatos.length,
        topN: parsed.data.topN ?? 3,
        mejorSlug: resultado.mejor?.slug ?? null,
        mejorScore: resultado.mejor?.score ?? null,
        tokens: resultado.tokensInput + resultado.tokensOutput,
        ms: Date.now() - t0,
      },
      "detector de perfil ejecutado",
    );

    return NextResponse.json({
      mejor: resultado.mejor,
      candidatos: resultado.candidatos,
      _meta: {
        modelo: resultado.modelo,
        tokensInput: resultado.tokensInput,
        tokensOutput: resultado.tokensOutput,
        tiempoMs: resultado.tiempoMs,
        totalCandidatos: candidatos.length,
      },
    });
  } catch (err) {
    return respuestaError(err);
  }
}
