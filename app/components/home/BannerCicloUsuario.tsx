import { Types } from "mongoose";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Usuario } from "@/models/Usuario";
import { PLANES } from "@/lib/planes";

/**
 * Banner compacto arriba de la Home con el resumen del ciclo del plan:
 *  - "Plan Pro · 12 / 75 extracciones este mes"
 *  - link a /cuenta para ver detalle
 *
 * Se renderiza nada cuando:
 *  - no hay sesión (la Home la ve solo gente logueada por el proxy, pero
 *    el componente es defensivo).
 *  - el usuario no tiene `planInfo` (admin sin gate).
 *  - estadoCuenta = "activa" y el uso es muy bajo (< 50%) — no vale la
 *    pena ocupar espacio si no hay nada que decir.
 *
 * Cuando el uso pasa el 80% del límite, el banner se pone en tono ámbar
 * para llamar la atención.
 */
export async function BannerCicloUsuario(): Promise<React.ReactNode> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await conectarMongoose();
  const u = await Usuario.findById(new Types.ObjectId(session.user.id))
    .select({ planInfo: 1, rol: 1 })
    .lean();

  if (!u?.planInfo) return null;
  const pi = u.planInfo;
  const def = PLANES[pi.plan];
  const limite = def.limiteExtraccionesPorCiclo;
  const usado = pi.extraccionesEnPeriodo ?? 0;

  const pct = Number.isFinite(limite)
    ? Math.min(100, Math.round((usado / limite) * 100))
    : 0;
  const cerca = pct >= 80;
  const vencida = pi.estadoCuenta !== "activa";

  // Si no hay nada urgente que comunicar, no mostramos nada (admin o
  // uso bajo en plan amplio).
  if (!vencida && !cerca && usado < 1) return null;

  const colorBanner = vencida
    ? "border-amber-400/60 bg-amber-50/80 text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/40 dark:text-amber-100"
    : cerca
      ? "border-amber-400/40 bg-amber-50/60 text-amber-900 dark:border-amber-600/30 dark:bg-amber-950/30 dark:text-amber-100"
      : "border-sky-400/40 bg-sky-50/60 text-sky-900 dark:border-sky-600/30 dark:bg-sky-950/30 dark:text-sky-100";

  return (
    <Link
      href="/cuenta"
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-white/60 dark:hover:bg-white/5 ${colorBanner}`}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>
          Plan <strong>{def.nombre}</strong>
          {" · "}
          {Number.isFinite(limite) ? (
            <>
              {usado} / {limite} extracciones este ciclo
            </>
          ) : (
            <>{usado} extracciones este ciclo (sin tope)</>
          )}
          {vencida ? (
            <>
              {" · "}
              <strong>Modo lectura — renová para seguir extrayendo</strong>
            </>
          ) : null}
        </span>
      </div>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Ver detalle →
      </span>
    </Link>
  );
}
