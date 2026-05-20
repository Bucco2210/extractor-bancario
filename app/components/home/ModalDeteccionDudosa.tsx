"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  Banco,
  CoincidenciaDeteccion,
  Perfil,
} from "@/lib/home-tipos";

export function ModalDeteccionDudosa({
  candidatos,
  bancos,
  onElegir,
  onSaltar,
  onCancelar,
}: {
  candidatos: CoincidenciaDeteccion[];
  bancos: Banco[];
  onElegir: (perfil: Perfil) => void | Promise<void>;
  onSaltar: () => void;
  onCancelar: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancelar]);

  const perfilesPorId = new Map<string, Perfil>();
  for (const b of bancos) {
    for (const p of b.perfiles) perfilesPorId.set(p.id, p);
  }

  const candidatosResueltos = candidatos
    .map((c) => ({ c, perfil: perfilesPorId.get(c.perfilId) }))
    .filter((x): x is { c: CoincidenciaDeteccion; perfil: Perfil } =>
      Boolean(x.perfil),
    );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onCancelar}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Detección dudosa — elegí el perfil manualmente"
        className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-background p-5 shadow-xl"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">
                No pude identificar el banco con seguridad
              </h2>
              <p className="text-sm text-muted-foreground">
                La extracción ya está corriendo. Elegí el perfil correcto para
                asociarlo, o salteá este paso y editalo más tarde.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancelar}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex flex-col gap-2">
          {candidatosResueltos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              El detector no devolvió candidatos válidos.
            </p>
          ) : (
            candidatosResueltos.map(({ c, perfil }) => (
              <button
                key={c.perfilId}
                type="button"
                onClick={() => onElegir(perfil)}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/60"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{perfil.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    slug{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                      {perfil.slug}
                    </code>
                  </span>
                  {c.razones.length > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      {c.razones.slice(0, 2).join(" · ")}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums">
                  {(c.score * 100).toFixed(0)}%
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" onClick={onSaltar}>
            Saltar y revisar después
          </Button>
        </div>
      </div>
    </>
  );
}
