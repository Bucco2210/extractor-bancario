"use client";

import Link from "next/link";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import type { UltimoExtracto } from "@/lib/home-tipos";

const ETIQUETA_ESTADO: Record<
  string,
  { label: string; cls: string }
> = {
  pendiente: {
    label: "pendiente",
    cls: "bg-muted text-muted-foreground",
  },
  procesando: {
    label: "procesando…",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  },
  extraido: {
    label: "✓ listo",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  parcial: {
    label: "⚠ parcial",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  error: {
    label: "✗ error",
    cls: "bg-destructive/10 text-destructive",
  },
};

export function CarruselUltimosExtractos({
  ultimos,
}: {
  ultimos: UltimoExtracto[];
}) {
  if (ultimos.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos extractos procesados
        </h2>
      </header>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {ultimos.map((u) => {
          const estadoInfo = ETIQUETA_ESTADO[u.estado] ?? {
            label: u.estado,
            cls: "bg-muted text-muted-foreground",
          };
          return (
            <Link
              key={u.id}
              href={`/extracciones/${u.id}`}
              className="group flex min-w-[180px] shrink-0 flex-col gap-2 rounded-lg border bg-card p-3 text-sm transition-colors hover:border-primary/60"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium leading-tight">
                  {u.banco ?? u.perfilNombre ?? "Extracto"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {u.periodo ?? u.cuenta ?? "—"}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${estadoInfo.cls}`}
                >
                  {estadoInfo.label}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {u.movimientosCount} mov.
                </span>
              </div>
              <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground/40 transition-colors group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
