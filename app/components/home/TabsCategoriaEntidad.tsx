"use client";

import { Landmark, Wallet, CreditCard, Star } from "lucide-react";
import type { CategoriaTab } from "@/lib/home-tipos";

const TABS: Array<{
  id: CategoriaTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "banco", label: "Bancos", icon: Landmark },
  { id: "billetera", label: "Billeteras", icon: Wallet },
  { id: "tarjeta", label: "Tarjetas", icon: CreditCard },
  { id: "favoritos", label: "Favoritos", icon: Star },
];

export function TabsCategoriaEntidad({
  activa,
  onCambiar,
  conteos,
}: {
  activa: CategoriaTab;
  onCambiar: (t: CategoriaTab) => void;
  conteos: Record<CategoriaTab, number>;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const seleccionada = activa === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={seleccionada}
            onClick={() => onCambiar(t.id)}
            className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
              seleccionada
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:bg-background/60"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                seleccionada
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {conteos[t.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
