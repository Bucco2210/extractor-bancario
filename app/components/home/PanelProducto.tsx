"use client";

import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarEntidad } from "./AvatarEntidad";
import { DropzoneRapido } from "./DropzoneRapido";
import type {
  Banco,
  Perfil,
  RespuestaInicioExtraccion,
} from "@/lib/home-tipos";

const ETIQUETAS_TIPO: Record<string, string> = {
  extracto_bancario: "Extracto bancario",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

function etiquetaTipo(tipo: string): string {
  return ETIQUETAS_TIPO[tipo] ?? tipo;
}

export function PanelProducto({
  banco,
  onCerrar,
  onToggleFavorito,
  onIniciarExtraccion,
}: {
  banco: Banco;
  onCerrar: () => void;
  onToggleFavorito: () => void;
  onIniciarExtraccion: (
    perfil: Perfil,
    archivo: File,
    res: RespuestaInicioExtraccion,
  ) => void | Promise<void>;
}) {
  const [perfilActivoId, setPerfilActivoId] = useState<string | null>(
    banco.perfiles[0]?.id ?? null,
  );
  const perfilActivo =
    banco.perfiles.find((p) => p.id === perfilActivoId) ?? banco.perfiles[0];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onCerrar}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal
        aria-label={`Panel de ${banco.entidad.nombre}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-background p-5 shadow-xl"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <AvatarEntidad
              slug={banco.entidad.slug}
              nombre={banco.entidad.nombre}
              size="lg"
            />
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold leading-tight">
                {banco.entidad.nombre}
              </h2>
              <span className="text-xs text-muted-foreground">
                {banco.categoria === "banco" ? "Banco" : "Billetera"} ·{" "}
                {banco.perfiles.length}{" "}
                {banco.perfiles.length === 1 ? "perfil" : "perfiles"}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCerrar}
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {banco.perfiles.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Esta entidad todavía no tiene perfiles activos.
          </div>
        ) : (
          <>
            <div
              role="tablist"
              className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1"
            >
              {banco.perfiles.map((p) => {
                const seleccionado = p.id === perfilActivo?.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={seleccionado}
                    onClick={() => setPerfilActivoId(p.id)}
                    className={`rounded px-2.5 py-1 text-xs transition-colors ${
                      seleccionado
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-background/60"
                    }`}
                  >
                    {p.nombre}
                  </button>
                );
              })}
            </div>

            {perfilActivo ? (
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">{perfilActivo.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {etiquetaTipo(perfilActivo.tipoDocumento)} ·{" "}
                    {perfilActivo.monedaPrimaria} · slug{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                      {perfilActivo.slug}
                    </code>
                  </span>
                </div>

                <DropzoneRapido
                  perfilId={perfilActivo.id}
                  mostrandoEnPanel
                  textoAyuda={`Se va a usar el perfil "${perfilActivo.nombre}" — sin auto-detección.`}
                  onIniciar={(archivo, res) =>
                    onIniciarExtraccion(perfilActivo, archivo, res)
                  }
                />
              </div>
            ) : null}
          </>
        )}

        <div className="mt-auto flex flex-col gap-3 border-t pt-4">
          <Button
            type="button"
            variant={banco.esFavorito ? "default" : "outline"}
            onClick={onToggleFavorito}
            className="justify-start"
          >
            <Star
              className="mr-2 h-4 w-4"
              fill={banco.esFavorito ? "currentColor" : "none"}
            />
            {banco.esFavorito
              ? "Quitar de favoritos"
              : `Marcar ${banco.entidad.nombre} como favorito`}
          </Button>
        </div>
      </aside>
    </>
  );
}
