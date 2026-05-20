"use client";

import { CardBanco } from "./CardBanco";
import type { Banco } from "@/lib/home-tipos";

export function GridBancos({
  bancos,
  onAbrir,
  onToggleFavorito,
  mensajeVacio,
}: {
  bancos: Banco[];
  onAbrir: (banco: Banco) => void;
  onToggleFavorito: (banco: Banco) => void;
  mensajeVacio: string;
}) {
  if (bancos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {mensajeVacio}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {bancos.map((b) => (
        <CardBanco
          key={b.entidad.slug}
          banco={b}
          onAbrir={() => onAbrir(b)}
          onToggleFavorito={() => onToggleFavorito(b)}
        />
      ))}
    </div>
  );
}
