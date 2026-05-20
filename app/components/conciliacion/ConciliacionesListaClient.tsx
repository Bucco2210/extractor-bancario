"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

type Item = {
  id: string;
  extraccionId: string;
  nombre: string;
  estado: string;
  segundaFuente: { archivoNombre: string; formato: string };
  estadisticas: {
    totalExtracto: number;
    totalSegundaFuente: number;
    matcheados: number;
    huerfanosExtracto: number;
    huerfanosSegundaFuente: number;
    enGruposManuales: number;
  };
  createdAt: string;
};

const FMT_FECHA = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function ConciliacionesListaClient() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/conciliaciones?limite=100", {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.mensaje ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { items: Item[] };
        if (!cancelado) setItems(data.items);
      } catch (err) {
        if (cancelado) return;
        const msg =
          err instanceof Error ? err.message : "Error al cargar conciliaciones.";
        toast.error(msg);
        setItems([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (items === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando conciliaciones…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
        Todavía no hay conciliaciones. Abrí un extracto extraído y usá el
        botón <strong>Conciliar</strong> para arrancar.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => {
        const total = it.estadisticas.totalExtracto;
        const pct = total ? Math.round((it.estadisticas.matcheados / total) * 100) : 0;
        return (
          <li
            key={it.id}
            className="flex flex-col gap-2 rounded-md border bg-card/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{it.nombre}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {it.estado}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>{it.segundaFuente.archivoNombre}</span>
                <span>·</span>
                <span>{FMT_FECHA.format(new Date(it.createdAt))}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-emerald-700 dark:text-emerald-300">
                  {it.estadisticas.matcheados} matcheados ({pct}%)
                </span>
                <span className="text-amber-700 dark:text-amber-300">
                  {it.estadisticas.huerfanosExtracto +
                    it.estadisticas.huerfanosSegundaFuente}{" "}
                  huérfanos
                </span>
                {it.estadisticas.enGruposManuales > 0 ? (
                  <span className="text-sky-700 dark:text-sky-300">
                    {it.estadisticas.enGruposManuales} en grupos manuales
                  </span>
                ) : null}
              </div>
            </div>
            <Link
              href={`/conciliacion/${it.id}`}
              className="inline-flex items-center gap-1 self-start rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent sm:self-auto"
            >
              Abrir
              <ArrowRight className="h-4 w-4" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
