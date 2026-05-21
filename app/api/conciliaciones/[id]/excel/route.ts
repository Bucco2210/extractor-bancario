import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import ExcelJS from "exceljs";
import { conectarMongoose } from "@/lib/mongo";
import { AppError, respuestaError } from "@/lib/errors";
import { requerirSesion } from "@/lib/permisos";
import { Conciliacion } from "@/models/Conciliacion";
import { Extraccion } from "@/models/Extraccion";
import {
  descifrarConciliacionLean,
  descifrarExtraccionLean,
} from "@/lib/cifrado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATO_IMPORTE = "#,##0.00;[Red]-#,##0.00";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requerirSesion();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("INPUT_INVALIDO", "ID inválido.");
    }
    await conectarMongoose();
    const concRaw = await Conciliacion.findOne({
      _id: new Types.ObjectId(id),
      usuarioId: new Types.ObjectId(session.user.id),
    }).lean();
    if (!concRaw) throw new AppError("NO_ENCONTRADO", "Conciliación no encontrada.");
    const conc = descifrarConciliacionLean(concRaw);

    const extraccionRaw = await Extraccion.findOne({
      _id: conc.extraccionId,
      usuarioId: new Types.ObjectId(session.user.id),
    })
      .select({ movimientos: 1, banco: 1, periodo: 1, cuenta: 1 })
      .lean();
    const extraccion = descifrarExtraccionLean(extraccionRaw);

    const movimientos = extraccion?.movimientos ?? [];
    const matchPorExtracto = new Map<number, (typeof conc.matches)[number]>();
    for (const m of conc.matches) matchPorExtracto.set(m.extractoIdx, m);
    const matchPorRegistro = new Map<number, (typeof conc.matches)[number]>();
    for (const m of conc.matches) matchPorRegistro.set(m.registroIdx, m);
    const descartados = new Set(conc.descartadosExtracto);
    const gruposManuales = conc.gruposManuales ?? [];
    const grupoPorExtracto = new Map<number, number>(); // extractoIdx → indice grupo
    const grupoPorRegistro = new Map<number, number>();
    gruposManuales.forEach((g, gi) => {
      for (const i of g.extractoIdxs) grupoPorExtracto.set(i, gi);
      for (const i of g.registroIdxs) grupoPorRegistro.set(i, gi);
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "B&B Tech";
    wb.created = new Date();

    /* === Resumen === */
    const resumen = wb.addWorksheet("Resumen");
    resumen.addRow(["Conciliación", conc.nombre]);
    resumen.addRow(["Estado", conc.estado]);
    resumen.addRow(["Banco / cuenta", extraccion?.banco ?? "(s/d)"]);
    resumen.addRow(["Período", extraccion?.periodo ?? "(s/d)"]);
    resumen.addRow(["Archivo segunda fuente", conc.segundaFuente.archivoNombre]);
    resumen.addRow([]);
    resumen.addRow(["Tolerancia días", conc.tolerancias.dias]);
    resumen.addRow(["Tolerancia importe", conc.tolerancias.importe]);
    resumen.addRow(["Umbral fuzzy", conc.tolerancias.fuzzyUmbral]);
    resumen.addRow([]);
    resumen.addRow(["Total movimientos extracto", conc.estadisticas.totalExtracto]);
    resumen.addRow([
      "Total registros segunda fuente",
      conc.estadisticas.totalSegundaFuente,
    ]);
    resumen.addRow(["Matcheados", conc.estadisticas.matcheados]);
    resumen.addRow([
      "Huérfanos extracto",
      conc.estadisticas.huerfanosExtracto,
    ]);
    resumen.addRow([
      "Huérfanos segunda fuente",
      conc.estadisticas.huerfanosSegundaFuente,
    ]);
    resumen.addRow([
      "Movimientos en grupos manuales",
      conc.estadisticas.enGruposManuales ?? 0,
    ]);
    resumen.addRow(["Cantidad de grupos manuales", gruposManuales.length]);
    resumen.getColumn(1).width = 32;
    resumen.getColumn(2).width = 32;

    /* === Extracto === */
    const sheetExt = wb.addWorksheet("Extracto");
    sheetExt.addRow([
      "Idx",
      "Fecha",
      "Descripción",
      "Débito",
      "Crédito",
      "Saldo",
      "Estado",
      "Match (idx)",
      "Match score",
      "Registro fecha",
      "Registro descripción",
      "Registro monto",
    ]);
    movimientos.forEach((m, idx) => {
      const match = matchPorExtracto.get(idx);
      const reg = match
        ? conc.segundaFuente.registros.find((r) => r.idx === match.registroIdx)
        : null;
      const grupoIdx = grupoPorExtracto.get(idx);
      let estado: string;
      let referencia: number | string = "";
      let score: number | string = "";
      let regFecha = "";
      let regDescripcion = "";
      let regMonto: number | null = null;
      if (grupoIdx !== undefined) {
        estado = `grupo manual #${grupoIdx + 1}`;
      } else if (descartados.has(idx)) {
        estado = "descartado";
      } else if (match) {
        estado = match.confirmadoManualmente ? "match manual" : "match auto";
        referencia = match.registroIdx;
        score = Number(match.score.toFixed(3));
        regFecha = reg?.fecha ?? "";
        regDescripcion = reg?.descripcion ?? "";
        regMonto = reg?.monto ?? null;
      } else {
        estado = "huérfano";
      }
      sheetExt.addRow([
        idx,
        m.fecha ?? "",
        m.descripcion ?? "",
        m.debito ?? null,
        m.credito ?? null,
        m.saldo ?? null,
        estado,
        referencia,
        score,
        regFecha,
        regDescripcion,
        regMonto,
      ]);
    });
    aplicarFormatoMontos(sheetExt, [4, 5, 6, 12]);
    sheetExt.columns.forEach((c) => {
      c.width = Math.max(c.width ?? 10, 14);
    });

    /* === Segunda fuente === */
    const sheetSF = wb.addWorksheet("Segunda fuente");
    sheetSF.addRow([
      "Idx",
      "Fecha",
      "Descripción",
      "Monto",
      "Referencia",
      "Estado",
      "Match (extracto idx)",
      "Match score",
    ]);
    conc.segundaFuente.registros.forEach((r) => {
      const match = matchPorRegistro.get(r.idx);
      const grupoIdx = grupoPorRegistro.get(r.idx);
      let estado: string;
      let referencia: number | string = "";
      let score: number | string = "";
      if (grupoIdx !== undefined) {
        estado = `grupo manual #${grupoIdx + 1}`;
      } else if (match) {
        estado = match.confirmadoManualmente ? "match manual" : "match auto";
        referencia = match.extractoIdx;
        score = Number(match.score.toFixed(3));
      } else {
        estado = "huérfano";
      }
      sheetSF.addRow([
        r.idx,
        r.fecha ?? "",
        r.descripcion ?? "",
        r.monto ?? null,
        r.referencia ?? "",
        estado,
        referencia,
        score,
      ]);
    });
    aplicarFormatoMontos(sheetSF, [4]);
    sheetSF.columns.forEach((c) => {
      c.width = Math.max(c.width ?? 10, 14);
    });

    /* === Grupos manuales === */
    if (gruposManuales.length > 0) {
      const sheetGM = wb.addWorksheet("Grupos manuales");
      sheetGM.addRow([
        "Grupo",
        "Lado",
        "Idx",
        "Fecha",
        "Descripción",
        "Monto",
        "Nota del grupo",
      ]);
      gruposManuales.forEach((g, gi) => {
        const etiqueta = `#${gi + 1}`;
        for (const i of g.extractoIdxs) {
          const m = movimientos[i];
          const monto = (m?.credito ?? 0) - (m?.debito ?? 0);
          sheetGM.addRow([
            etiqueta,
            "Extracto",
            i,
            m?.fecha ?? "",
            m?.descripcion ?? "",
            monto || null,
            g.nota ?? "",
          ]);
        }
        for (const i of g.registroIdxs) {
          const r = conc.segundaFuente.registros.find((x) => x.idx === i);
          sheetGM.addRow([
            etiqueta,
            "Segunda fuente",
            i,
            r?.fecha ?? "",
            r?.descripcion ?? "",
            r?.monto ?? null,
            g.nota ?? "",
          ]);
        }
      });
      aplicarFormatoMontos(sheetGM, [6]);
      sheetGM.columns.forEach((c) => {
        c.width = Math.max(c.width ?? 10, 14);
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const nombre = `conciliacion-${conc.nombre.replace(/[^a-zA-Z0-9_-]+/g, "_")}.xlsx`;
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
      },
    });
  } catch (err) {
    return respuestaError(err);
  }
}

function aplicarFormatoMontos(
  sheet: ExcelJS.Worksheet,
  columnas: number[],
): void {
  for (const c of columnas) {
    sheet.getColumn(c).numFmt = FORMATO_IMPORTE;
  }
}
