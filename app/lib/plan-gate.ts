import "server-only";
import { Types } from "mongoose";
import { Usuario } from "@/models/Usuario";
import { AppError } from "@/lib/errors";
import {
  PLANES,
  PLAN_DEFAULT,
  calcularFinCiclo,
  type TipoPlan,
  type CicloFacturacion,
  type EstadoCuenta,
} from "@/lib/planes";
import type { RolUsuario } from "@/models/Usuario";

/** Acción que el gate evalúa. Cada una pesa contra un límite distinto. */
export type AccionGated = "crear_extraccion" | "crear_conciliacion";

type PlanInfo = {
  plan: TipoPlan;
  cicloFacturacion: CicloFacturacion;
  cicloInicio: Date;
  cicloFin: Date;
  extraccionesEnPeriodo: number;
  conciliacionesEnPeriodo: number;
  estadoCuenta: EstadoCuenta;
};

/**
 * Verifica que el usuario pueda ejecutar `accion` en su plan actual.
 * Maneja:
 *   - Admins: pasan sin chequeo (sin límites).
 *   - planInfo faltante: se inicializa con PLAN_DEFAULT (trial).
 *   - Ciclo vencido + plan trial: cuenta queda "vencida" → error.
 *   - Ciclo vencido + plan pago: se renueva ventana, contadores a 0.
 *   - estadoCuenta "vencida" o "suspendida": modo lectura → error.
 *   - Límite del plan superado: error LIMITE_EXCEDIDO.
 *
 * Si todo OK, incrementa el contador correspondiente atómicamente y
 * devuelve `{ ok: true }`. Si no, lanza AppError con código apropiado.
 */
export async function verificarLimitePlan(opts: {
  usuarioId: string;
  rol: RolUsuario;
  accion: AccionGated;
}): Promise<void> {
  // Admins pasan sin tope (decisión de producto: sin límites).
  if (opts.rol === "admin") return;

  const usuario = await Usuario.findById(new Types.ObjectId(opts.usuarioId))
    .select({ planInfo: 1 })
    .lean();

  if (!usuario) {
    throw new AppError("SIN_AUTH", "Usuario no encontrado.");
  }

  let planInfo = usuario.planInfo as PlanInfo | null | undefined;

  // Bootstrap: si el usuario nunca tuvo planInfo (operadores creados
  // antes de Fase 9), arrancamos con trial.
  if (!planInfo) {
    planInfo = await bootstrapearPlan(opts.usuarioId);
  }

  // Detectar ciclo vencido y o bien renovar (planes pagos) o bloquear
  // (trial, que no se autorrenueva).
  const ahora = Date.now();
  if (ahora > planInfo.cicloFin.getTime()) {
    if (planInfo.plan === "trial") {
      await marcarVencida(opts.usuarioId);
      throw new AppError(
        "LIMITE_EXCEDIDO",
        "Tu prueba gratuita venció. Pedí un plan al administrador para seguir extrayendo.",
      );
    }
    // Plan pago: rotamos la ventana y reseteamos contadores.
    planInfo = await rotarCicloPlanPago(opts.usuarioId, planInfo);
  }

  if (planInfo.estadoCuenta !== "activa") {
    throw new AppError(
      "LIMITE_EXCEDIDO",
      planInfo.estadoCuenta === "vencida"
        ? "Tu plan está vencido. Podés ver y exportar lo que ya tenés, pero no crear cosas nuevas."
        : "Tu cuenta está suspendida. Contactá al administrador.",
    );
  }

  const def = PLANES[planInfo.plan];
  const limite =
    opts.accion === "crear_extraccion"
      ? def.limiteExtraccionesPorCiclo
      : def.limiteConciliacionesPorCiclo;
  const usado =
    opts.accion === "crear_extraccion"
      ? planInfo.extraccionesEnPeriodo
      : planInfo.conciliacionesEnPeriodo;

  if (limite === 0) {
    throw new AppError(
      "LIMITE_EXCEDIDO",
      `Tu plan ${def.nombre} no incluye ${opts.accion === "crear_extraccion" ? "extracciones" : "conciliaciones"}.`,
    );
  }

  if (Number.isFinite(limite) && usado >= limite) {
    throw new AppError(
      "LIMITE_EXCEDIDO",
      `Alcanzaste el límite del plan ${def.nombre}: ${limite} ${opts.accion === "crear_extraccion" ? "extracciones" : "conciliaciones"} por ciclo.`,
    );
  }

  // Incremento atómico. Si dos requests entran en paralelo, ambos se
  // suman; el peor caso es 1-2 sobre el límite y el siguiente bloquea.
  // Suficiente para el caso de uso.
  const campoContador =
    opts.accion === "crear_extraccion"
      ? "planInfo.extraccionesEnPeriodo"
      : "planInfo.conciliacionesEnPeriodo";
  await Usuario.updateOne(
    { _id: new Types.ObjectId(opts.usuarioId) },
    { $inc: { [campoContador]: 1 } },
  );
}

async function bootstrapearPlan(usuarioId: string): Promise<PlanInfo> {
  const inicio = new Date();
  const fin = calcularFinCiclo(PLAN_DEFAULT, "mensual", inicio);
  const planInfo: PlanInfo = {
    plan: PLAN_DEFAULT,
    cicloFacturacion: "mensual",
    cicloInicio: inicio,
    cicloFin: fin,
    extraccionesEnPeriodo: 0,
    conciliacionesEnPeriodo: 0,
    estadoCuenta: "activa",
  };
  await Usuario.updateOne(
    { _id: new Types.ObjectId(usuarioId) },
    { $set: { planInfo } },
  );
  return planInfo;
}

async function marcarVencida(usuarioId: string): Promise<void> {
  await Usuario.updateOne(
    { _id: new Types.ObjectId(usuarioId) },
    { $set: { "planInfo.estadoCuenta": "vencida" } },
  );
}

async function rotarCicloPlanPago(
  usuarioId: string,
  actual: PlanInfo,
): Promise<PlanInfo> {
  const inicio = new Date();
  const fin = calcularFinCiclo(actual.plan, actual.cicloFacturacion, inicio);
  const nuevo: PlanInfo = {
    ...actual,
    cicloInicio: inicio,
    cicloFin: fin,
    extraccionesEnPeriodo: 0,
    conciliacionesEnPeriodo: 0,
  };
  await Usuario.updateOne(
    { _id: new Types.ObjectId(usuarioId) },
    {
      $set: {
        "planInfo.cicloInicio": inicio,
        "planInfo.cicloFin": fin,
        "planInfo.extraccionesEnPeriodo": 0,
        "planInfo.conciliacionesEnPeriodo": 0,
      },
    },
  );
  return nuevo;
}
