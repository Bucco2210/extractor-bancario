"use client";

import { Star } from "lucide-react";
import { AvatarEntidad } from "./AvatarEntidad";
import type { Banco } from "@/lib/home-tipos";

export function CardBanco({
  banco,
  onAbrir,
  onToggleFavorito,
}: {
  banco: Banco;
  onAbrir: () => void;
  onToggleFavorito: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group relative flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60"
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorito();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorito();
          }
        }}
        aria-label={
          banco.esFavorito ? "Quitar de favoritos" : "Marcar como favorito"
        }
        className={`absolute right-3 top-3 rounded p-1 transition-colors ${
          banco.esFavorito
            ? "text-amber-500"
            : "text-muted-foreground/40 hover:text-amber-500"
        }`}
      >
        <Star
          className="h-4 w-4"
          fill={banco.esFavorito ? "currentColor" : "none"}
        />
      </span>

      <AvatarEntidad
        slug={banco.entidad.slug}
        nombre={banco.entidad.nombre}
        size="lg"
      />

      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold leading-tight">
          {banco.entidad.nombre}
        </span>
        <span className="text-xs text-muted-foreground">
          {banco.perfiles.length}{" "}
          {banco.perfiles.length === 1 ? "perfil" : "perfiles"}
        </span>
      </div>

      <div className="mt-1 text-[11px] text-muted-foreground">
        {banco.extraccionesDelUsuario > 0
          ? `${banco.extraccionesDelUsuario} extracci${banco.extraccionesDelUsuario === 1 ? "ón" : "ones"} tuyas`
          : "🧪 sin extracciones todavía"}
      </div>
    </button>
  );
}
