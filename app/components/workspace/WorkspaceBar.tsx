"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PestanaWorkspace } from "@/stores/workspace";

export function WorkspaceBar({
  pestanas,
  activeId,
  onActivar,
  onCerrar,
}: {
  pestanas: PestanaWorkspace[];
  activeId: string | null;
  onActivar: (id: string) => void;
  onCerrar: (id: string) => void;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/30 px-2 pt-2">
      {pestanas.map((p) => {
        const activa = p.id === activeId;
        return (
          <div
            key={p.id}
            onClick={() => onActivar(p.id)}
            role="tab"
            aria-selected={activa}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivar(p.id);
              }
            }}
            className={`group inline-flex max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 text-sm transition-colors ${
              activa
                ? "border-border bg-background"
                : "border-transparent text-muted-foreground hover:bg-background/60"
            }`}
          >
            <span className="truncate" title={p.titulo}>
              {p.titulo}
            </span>
            <button
              type="button"
              aria-label={`Cerrar pestaña ${p.titulo}`}
              onClick={(e) => {
                e.stopPropagation();
                onCerrar(p.id);
              }}
              className={`rounded p-0.5 transition-colors ${
                activa
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "text-muted-foreground/60 group-hover:text-muted-foreground"
              }`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="Nueva pestaña (subir extracto)"
        className="ml-1 inline-flex items-center gap-1 rounded-t-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background/60"
        title="Nueva pestaña — abre la Home para subir un extracto"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
