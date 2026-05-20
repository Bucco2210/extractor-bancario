import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { Conciliacion } from "@/models/Conciliacion";
import { Extraccion } from "@/models/Extraccion";
import { conciliacionPatchSchema } from "@/lib/conciliaciones-schema";
import { serializarConciliacion } from "@/lib/conciliaciones-serializer";
import {
  aMovimientosExtracto,
  calcularEstadisticas,
  matchear,
  type Tolerancias,
} from "@/lib/conciliacion-matcheo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function leerYAutorizar(
  id: string,
  usuarioId: string,
): Promise<InstanceType<typeof Conciliacion>> {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("INPUT_INVALIDO", "ID inválido.");
  }
  const doc = await Conciliacion.findOne({
    _id: new Types.ObjectId(id),
    usuarioId: new Types.ObjectId(usuarioId),
  });
  if (!doc) throw new AppError("NO_ENCONTRADO", "Conciliación no encontrada.");
  return doc;
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    const { id } = await ctx.params;
    await conectarMongoose();
    const doc = await leerYAutorizar(id, session.user.id);
    return NextResponse.json(serializarConciliacion(doc.toObject()));
  } catch (err) {
    return respuestaError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    const { id } = await ctx.params;
    await conectarMongoose();
    const doc = await leerYAutorizar(id, session.user.id);
    await doc.deleteOne();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    const { id } = await ctx.params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("INPUT_INVALIDO", "El body debe ser JSON válido.");
    }
    const parsed = conciliacionPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("INPUT_INVALIDO", "Body inválido.", {
        issues: parsed.error.flatten(),
      });
    }

    await conectarMongoose();
    const doc = await leerYAutorizar(id, session.user.id);

    if (parsed.data.nombre !== undefined) doc.nombre = parsed.data.nombre;
    if (parsed.data.notas !== undefined) doc.notas = parsed.data.notas;
    if (parsed.data.tolerancias) {
      doc.tolerancias = parsed.data.tolerancias;
    }

    if (parsed.data.forzarMatch) {
      const { extractoIdx, registroIdx } = parsed.data.forzarMatch;
      // Sacar matches que pisen alguno de los dos índices
      const filtrados = doc.matches.filter(
        (m) =>
          m.extractoIdx !== extractoIdx && m.registroIdx !== registroIdx,
      );
      filtrados.push({
        extractoIdx,
        registroIdx,
        score: 1,
        criterios: { fecha: 1, importe: 1, descripcion: 1 },
        confirmadoManualmente: true,
      } as (typeof doc.matches)[number]);
      doc.set("matches", filtrados);
      doc.set(
        "descartadosExtracto",
        doc.descartadosExtracto.filter((i) => i !== extractoIdx),
      );
      sacarDeGrupos(doc, [extractoIdx], [registroIdx]);
    }

    if (parsed.data.quitarMatch) {
      const idx = parsed.data.quitarMatch.extractoIdx;
      doc.set(
        "matches",
        doc.matches.filter((m) => m.extractoIdx !== idx),
      );
    }

    if (parsed.data.descartarExtracto) {
      const { extractoIdx, descartar } = parsed.data.descartarExtracto;
      const set = new Set(doc.descartadosExtracto);
      if (descartar) {
        set.add(extractoIdx);
        doc.set(
          "matches",
          doc.matches.filter((m) => m.extractoIdx !== extractoIdx),
        );
        sacarDeGrupos(doc, [extractoIdx], []);
      } else {
        set.delete(extractoIdx);
      }
      doc.set("descartadosExtracto", Array.from(set).sort((a, b) => a - b));
    }

    if (parsed.data.crearGrupoManual) {
      const { extractoIdxs, registroIdxs, nota } = parsed.data.crearGrupoManual;
      // Sacar matches que toquen alguno de los índices que se van al grupo
      const exSet = new Set(extractoIdxs);
      const regSet = new Set(registroIdxs);
      doc.set(
        "matches",
        doc.matches.filter(
          (m) => !exSet.has(m.extractoIdx) && !regSet.has(m.registroIdx),
        ),
      );
      doc.set(
        "descartadosExtracto",
        doc.descartadosExtracto.filter((i) => !exSet.has(i)),
      );
      // Si los índices ya estaban en otro grupo, los sacamos del previo
      sacarDeGrupos(doc, extractoIdxs, registroIdxs);
      const nuevo = {
        extractoIdxs: [...extractoIdxs].sort((a, b) => a - b),
        registroIdxs: [...registroIdxs].sort((a, b) => a - b),
        nota: nota ?? "",
        creadoEn: new Date(),
      };
      doc.set("gruposManuales", [...doc.gruposManuales, nuevo]);
    }

    if (parsed.data.eliminarGrupoManual) {
      const { indice } = parsed.data.eliminarGrupoManual;
      if (indice < 0 || indice >= doc.gruposManuales.length) {
        throw new AppError(
          "INPUT_INVALIDO",
          `No existe el grupo con índice ${indice}.`,
        );
      }
      const copia = [...doc.gruposManuales];
      copia.splice(indice, 1);
      doc.set("gruposManuales", copia);
    }

    if (parsed.data.reMatchear) {
      const extraccion = await Extraccion.findOne({
        _id: doc.extraccionId,
        usuarioId: doc.usuarioId,
      })
        .select({ movimientos: 1 })
        .lean();
      if (!extraccion) {
        throw new AppError(
          "NO_ENCONTRADO",
          "La extracción asociada no existe; no puedo re-matchear.",
        );
      }
      // Excluir del re-matcheo los índices ya ocupados por grupos manuales
      const ocupadosExtracto = new Set<number>();
      const ocupadosRegistro = new Set<number>();
      for (const g of doc.gruposManuales) {
        for (const i of g.extractoIdxs) ocupadosExtracto.add(i);
        for (const i of g.registroIdxs) ocupadosRegistro.add(i);
      }
      const movimientosExtracto = aMovimientosExtracto(
        extraccion.movimientos ?? [],
      ).filter((m) => !ocupadosExtracto.has(m.idx));
      const tol: Tolerancias = {
        dias: doc.tolerancias.dias,
        importe: doc.tolerancias.importe,
        fuzzyUmbral: doc.tolerancias.fuzzyUmbral,
      };
      const r = matchear({
        movimientos: movimientosExtracto,
        registros: doc.segundaFuente.registros
          .filter((r) => !ocupadosRegistro.has(r.idx))
          .map((r) => ({
            idx: r.idx,
            fecha: r.fecha ?? null,
            descripcion: r.descripcion ?? "",
            monto: r.monto ?? null,
            referencia: r.referencia ?? null,
          })),
        tolerancias: tol,
        descartadosExtracto: doc.descartadosExtracto,
      });

      // Preservar los confirmadoManualmente existentes que no choquen
      // con el resultado nuevo.
      const manuales = doc.matches
        .filter((m) => m.confirmadoManualmente)
        .map((m) => ({
          extractoIdx: m.extractoIdx,
          registroIdx: m.registroIdx,
          score: m.score,
          criterios: {
            fecha: m.criterios?.fecha ?? 0,
            importe: m.criterios?.importe ?? 0,
            descripcion: m.criterios?.descripcion ?? 0,
          },
          confirmadoManualmente: true,
        }));
      const usadosExtracto = new Set<number>(manuales.map((m) => m.extractoIdx));
      const usadosRegistro = new Set<number>(manuales.map((m) => m.registroIdx));
      const automaticos = r.matches
        .filter(
          (m) =>
            !usadosExtracto.has(m.extractoIdx) &&
            !usadosRegistro.has(m.registroIdx),
        )
        .map((m) => ({ ...m, confirmadoManualmente: false }));
      doc.set("matches", [...manuales, ...automaticos]);
    }

    // Recalcular estadísticas siempre, incluso si solo cambiaron notas.
    const estadisticas = calcularEstadisticas({
      totalExtracto: doc.estadisticas.totalExtracto,
      totalSegundaFuente: doc.estadisticas.totalSegundaFuente,
      matchesExtractoIdxs: doc.matches.map((m) => m.extractoIdx),
      matchesRegistroIdxs: doc.matches.map((m) => m.registroIdx),
      descartadosExtracto: [...doc.descartadosExtracto],
      gruposManuales: doc.gruposManuales.map((g) => ({
        extractoIdxs: [...g.extractoIdxs],
        registroIdxs: [...g.registroIdxs],
      })),
    });
    doc.set("estadisticas", estadisticas);

    await doc.save();
    return NextResponse.json(serializarConciliacion(doc.toObject()));
  } catch (err) {
    return respuestaError(err);
  }
}

/**
 * Saca los índices indicados de cualquier grupo manual existente. Si un
 * grupo queda con uno de sus lados vacío, lo elimina del array.
 */
function sacarDeGrupos(
  doc: InstanceType<typeof Conciliacion>,
  extractoIdxs: number[],
  registroIdxs: number[],
): void {
  if (extractoIdxs.length === 0 && registroIdxs.length === 0) return;
  const exSet = new Set(extractoIdxs);
  const regSet = new Set(registroIdxs);
  const nuevos = doc.gruposManuales
    .map((g) => ({
      extractoIdxs: g.extractoIdxs.filter((i) => !exSet.has(i)),
      registroIdxs: g.registroIdxs.filter((i) => !regSet.has(i)),
      nota: g.nota ?? "",
      creadoEn: g.creadoEn,
    }))
    .filter((g) => g.extractoIdxs.length > 0 && g.registroIdxs.length > 0);
  doc.set("gruposManuales", nuevos);
}
