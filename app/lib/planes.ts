import "server-only";

/**
 * Matriz de planes del producto. Vive en código (no en DB) porque son
 * contrato comercial: cambian raramente y siempre con deploy.
 *
 * Precios en USD. Anual = 10 × mensual (2 meses gratis). Ajustá los
 * números acá si querés cambiar el pricing.
 *
 * `Infinity` para "sin límite": el `plan-gate.ts` lo trata como skip.
 */

export const TIPOS_PLAN = [
  "trial",
  "plus",
  "pro",
  "premium",
] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];

export const CICLOS_FACTURACION = ["mensual", "anual"] as const;
export type CicloFacturacion = (typeof CICLOS_FACTURACION)[number];

export const ESTADOS_CUENTA = ["activa", "vencida", "suspendida"] as const;
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number];

export type DefinicionPlan = {
  id: TipoPlan;
  nombre: string;
  /** Descripción corta para mostrar en la página de planes. */
  descripcionCorta: string;
  /** Bullets de features visibles en la card del plan. */
  features: string[];
  /** Precio en USD según ciclo. `null` para trial (no se vende). */
  precioUsd: { mensual: number | null; anual: number | null };
  /** Cuántas extracciones por ciclo. `Infinity` = sin tope. */
  limiteExtraccionesPorCiclo: number;
  /** Cuántas conciliaciones por ciclo. 0 = no permitido. `Infinity` = sin tope. */
  limiteConciliacionesPorCiclo: number;
  /** True si en el panel de planes se marca como "recomendado". */
  recomendado?: boolean;
};

export const PLANES: Record<TipoPlan, DefinicionPlan> = {
  trial: {
    id: "trial",
    nombre: "Prueba gratuita",
    descripcionCorta: "10 días para probar el flujo completo.",
    features: [
      "3 extracciones en 10 días",
      "Acceso a todos los bancos y billeteras",
      "Sin conciliación",
      "Export a Excel ilimitado",
    ],
    precioUsd: { mensual: null, anual: null },
    limiteExtraccionesPorCiclo: 3,
    limiteConciliacionesPorCiclo: 0,
  },
  plus: {
    id: "plus",
    nombre: "Plus",
    descripcionCorta: "Para el contador independiente.",
    features: [
      "20 extracciones por mes",
      "Todos los bancos y billeteras",
      "Soporte por email",
      "Sin conciliación",
    ],
    precioUsd: { mensual: 19, anual: 190 },
    limiteExtraccionesPorCiclo: 20,
    limiteConciliacionesPorCiclo: 0,
  },
  pro: {
    id: "pro",
    nombre: "Pro",
    descripcionCorta: "Para estudios contables chicos.",
    features: [
      "75 extracciones por mes",
      "Conciliación incluida (10 por mes)",
      "Soporte por email prioritario",
      "Todos los bancos y billeteras",
    ],
    precioUsd: { mensual: 49, anual: 490 },
    limiteExtraccionesPorCiclo: 75,
    limiteConciliacionesPorCiclo: 10,
    recomendado: true,
  },
  premium: {
    id: "premium",
    nombre: "Premium",
    descripcionCorta: "Para estudios contables grandes.",
    features: [
      "250 extracciones por mes",
      "Conciliación ilimitada",
      "Soporte dedicado",
      "Todos los bancos y billeteras",
    ],
    precioUsd: { mensual: 99, anual: 990 },
    limiteExtraccionesPorCiclo: 250,
    limiteConciliacionesPorCiclo: Infinity,
  },
};

/** Lista en el orden en que se muestran en la página de planes. */
export const ORDEN_PLANES_VISIBLE: TipoPlan[] = ["plus", "pro", "premium"];

export function planExiste(id: string): id is TipoPlan {
  return (TIPOS_PLAN as readonly string[]).includes(id);
}

/**
 * Calcula la duración (en ms) de un ciclo de facturación. Trial es
 * fijo a 10 días según convención del producto.
 */
export const DIAS_TRIAL = 10;

export function duracionCicloMs(
  plan: TipoPlan,
  ciclo: CicloFacturacion,
): number {
  const dia = 24 * 60 * 60 * 1000;
  if (plan === "trial") return DIAS_TRIAL * dia;
  return ciclo === "anual" ? 365 * dia : 30 * dia;
}

/**
 * Dado un plan y un punto de inicio, devuelve la fecha de fin del ciclo.
 */
export function calcularFinCiclo(
  plan: TipoPlan,
  ciclo: CicloFacturacion,
  inicio: Date,
): Date {
  return new Date(inicio.getTime() + duracionCicloMs(plan, ciclo));
}

/** Plan "default" para usuarios nuevos que no recibieron asignación. */
export const PLAN_DEFAULT: TipoPlan = "trial";
