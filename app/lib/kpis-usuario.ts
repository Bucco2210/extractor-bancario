import "server-only";
import { Types } from "mongoose";
import { Extraccion } from "@/models/Extraccion";
import { Conciliacion } from "@/models/Conciliacion";

/**
 * KPIs del propio usuario para la página `/cuenta` y para una mini-card
 * en Home. Distintos a los del panel admin (`/admin`): acá solo se ve
 * el alcance del propio user (siempre filtrado por `usuarioId`).
 *
 * La función no decide ventanas: recibe `cicloInicio`/`cicloFin` ya
 * resueltos desde `planInfo` para alinearse con lo que el plan-gate
 * está contando.
 */
export type KpisUsuario = {
  /** Extracciones del usuario en el ciclo actual del plan. */
  extraccionesEnCiclo: number;
  /** Conciliaciones del usuario en el ciclo actual. */
  conciliacionesEnCiclo: number;
  /** Tokens input + output sumados sobre las extracciones del ciclo. */
  tokensEnCiclo: number;
  /** Conteo de extracciones por estado en el ciclo. */
  porEstado: Record<string, number>;
  /** Total histórico (no filtrado por ciclo) — útil para el rótulo "X extractos procesados desde siempre". */
  extraccionesTotales: number;
  /** Total histórico de conciliaciones. */
  conciliacionesTotales: number;
};

export async function calcularKpisUsuario(input: {
  usuarioId: string;
  cicloInicio: Date | null;
  cicloFin: Date | null;
}): Promise<KpisUsuario> {
  const uid = new Types.ObjectId(input.usuarioId);

  const filtroCiclo =
    input.cicloInicio && input.cicloFin
      ? { createdAt: { $gte: input.cicloInicio, $lte: input.cicloFin } }
      : {};

  const [
    extraccionesEnCiclo,
    conciliacionesEnCiclo,
    tokensAgg,
    porEstadoAgg,
    extraccionesTotales,
    conciliacionesTotales,
  ] = await Promise.all([
    Extraccion.countDocuments({ usuarioId: uid, ...filtroCiclo }),
    Conciliacion.countDocuments({ usuarioId: uid, ...filtroCiclo }),
    Extraccion.aggregate([
      { $match: { usuarioId: uid, ...filtroCiclo } },
      {
        $group: {
          _id: null,
          input: { $sum: "$_meta.tokensInput" },
          output: { $sum: "$_meta.tokensOutput" },
        },
      },
    ]),
    Extraccion.aggregate([
      { $match: { usuarioId: uid, ...filtroCiclo } },
      { $group: { _id: "$estado", count: { $sum: 1 } } },
    ]),
    Extraccion.countDocuments({ usuarioId: uid }),
    Conciliacion.countDocuments({ usuarioId: uid }),
  ]);

  const tokensEnCiclo =
    (tokensAgg[0]?.input ?? 0) + (tokensAgg[0]?.output ?? 0);

  const porEstado: Record<string, number> = {};
  for (const row of porEstadoAgg as Array<{
    _id: string | null;
    count: number;
  }>) {
    if (row._id) porEstado[row._id] = row.count;
  }

  return {
    extraccionesEnCiclo,
    conciliacionesEnCiclo,
    tokensEnCiclo,
    porEstado,
    extraccionesTotales,
    conciliacionesTotales,
  };
}
