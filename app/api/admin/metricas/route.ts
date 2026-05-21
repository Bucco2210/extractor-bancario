import { NextResponse } from "next/server";
import { conectarMongoose } from "@/lib/mongo";
import { respuestaError } from "@/lib/errors";
import { requerirRol } from "@/lib/permisos";
import { Usuario } from "@/models/Usuario";
import { Extraccion } from "@/models/Extraccion";
import { Pago } from "@/models/Pago";
import { Conciliacion } from "@/models/Conciliacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard de KPIs del admin. Se calcula on-demand con aggregations.
 * No cachea — son pocos docs y la latencia es OK por ahora.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requerirRol("admin");
    await conectarMongoose();

    const haceUnMes = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsuarios,
      usuariosPorPlan,
      usuariosPorEstado,
      totalExtracciones,
      extraccionesUltimos30,
      tokensTotales,
      tokensUltimos30,
      extraccionesPorEstado,
      pagosTotales,
      pagosUltimos30,
      totalConciliaciones,
      conciliacionesUltimos30,
    ] = await Promise.all([
      Usuario.countDocuments({}),
      Usuario.aggregate([
        { $group: { _id: "$planInfo.plan", count: { $sum: 1 } } },
      ]),
      Usuario.aggregate([
        { $group: { _id: "$planInfo.estadoCuenta", count: { $sum: 1 } } },
      ]),
      Extraccion.countDocuments({}),
      Extraccion.countDocuments({ createdAt: { $gte: haceUnMes } }),
      Extraccion.aggregate([
        {
          $group: {
            _id: null,
            input: { $sum: "$_meta.tokensInput" },
            output: { $sum: "$_meta.tokensOutput" },
          },
        },
      ]),
      Extraccion.aggregate([
        { $match: { createdAt: { $gte: haceUnMes } } },
        {
          $group: {
            _id: null,
            input: { $sum: "$_meta.tokensInput" },
            output: { $sum: "$_meta.tokensOutput" },
          },
        },
      ]),
      Extraccion.aggregate([
        { $group: { _id: "$estado", count: { $sum: 1 } } },
      ]),
      Pago.aggregate([
        { $match: { estado: "confirmado" } },
        {
          $group: {
            _id: "$moneda",
            total: { $sum: "$monto" },
            cantidad: { $sum: 1 },
          },
        },
      ]),
      Pago.aggregate([
        {
          $match: {
            estado: "confirmado",
            createdAt: { $gte: haceUnMes },
          },
        },
        {
          $group: {
            _id: "$moneda",
            total: { $sum: "$monto" },
            cantidad: { $sum: 1 },
          },
        },
      ]),
      Conciliacion.countDocuments({}),
      Conciliacion.countDocuments({ createdAt: { $gte: haceUnMes } }),
    ]);

    function tomarPorMoneda(
      rows: Array<{ _id: string; total: number; cantidad: number }>,
    ): Record<string, { total: number; cantidad: number }> {
      const out: Record<string, { total: number; cantidad: number }> = {};
      for (const r of rows) out[r._id] = { total: r.total, cantidad: r.cantidad };
      return out;
    }

    function tomarPorClave(
      rows: Array<{ _id: string | null; count: number }>,
    ): Record<string, number> {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const key = r._id ?? "sin_dato";
        out[key] = r.count;
      }
      return out;
    }

    return NextResponse.json({
      usuarios: {
        total: totalUsuarios,
        porPlan: tomarPorClave(usuariosPorPlan),
        porEstado: tomarPorClave(usuariosPorEstado),
      },
      extracciones: {
        total: totalExtracciones,
        ultimos30Dias: extraccionesUltimos30,
        porEstado: tomarPorClave(extraccionesPorEstado),
        tokens: {
          total: {
            input: tokensTotales[0]?.input ?? 0,
            output: tokensTotales[0]?.output ?? 0,
          },
          ultimos30Dias: {
            input: tokensUltimos30[0]?.input ?? 0,
            output: tokensUltimos30[0]?.output ?? 0,
          },
        },
      },
      conciliaciones: {
        total: totalConciliaciones,
        ultimos30Dias: conciliacionesUltimos30,
      },
      ingresos: {
        total: tomarPorMoneda(pagosTotales),
        ultimos30Dias: tomarPorMoneda(pagosUltimos30),
      },
    });
  } catch (err) {
    return respuestaError(err);
  }
}
