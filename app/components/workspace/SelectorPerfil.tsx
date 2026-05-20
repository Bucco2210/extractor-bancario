"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Perfil = {
  id: string;
  slug: string;
  nombre: string;
  entidad: { slug: string; nombre: string };
  tipoDocumento: string;
  monedaPrimaria: string;
  activo: boolean;
};

const ETIQUETAS_TIPO: Record<string, string> = {
  extracto_bancario: "Extracto bancario",
  tarjeta_credito: "Tarjeta crédito",
  tarjeta_debito: "Tarjeta débito",
};

export function SelectorPerfil({
  extraccionId,
  perfilIdActual,
  onCambiado,
}: {
  extraccionId: string;
  perfilIdActual: string | null;
  onCambiado: (perfilId: string) => void;
}) {
  const [perfiles, setPerfiles] = useState<Perfil[] | null>(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/perfiles?activo=true&limite=200", {
          cache: "no-store",
        });
        if (!res.ok || cancelado) return;
        const data = (await res.json()) as { items: Perfil[] };
        if (!cancelado) setPerfiles(data.items);
      } catch {
        if (!cancelado) setPerfiles([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function aplicar(nuevoPerfilId: string) {
    if (!nuevoPerfilId || nuevoPerfilId === perfilIdActual) return;
    setAplicando(true);
    try {
      const res = await fetch(`/api/extracciones/${extraccionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: nuevoPerfilId }),
      });
      const json = (await res.json()) as
        | { perfilId: string; banco: string }
        | { mensaje?: string };
      if (!res.ok) {
        const msg = "mensaje" in json ? json.mensaje : "Error al cambiar perfil.";
        toast.error(msg ?? "Error al cambiar perfil.");
        return;
      }
      toast.success("Perfil actualizado.");
      onCambiado(nuevoPerfilId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2 text-sm">
      <label htmlFor="selector-perfil" className="text-muted-foreground">
        Perfil:
      </label>
      <select
        id="selector-perfil"
        disabled={aplicando || !perfiles}
        value={perfilIdActual ?? ""}
        onChange={(e) => void aplicar(e.target.value)}
        className="rounded border bg-background px-2 py-1 text-sm"
      >
        <option value="" disabled>
          {perfiles ? "Elegir perfil…" : "Cargando…"}
        </option>
        {perfiles?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.entidad.nombre} · {ETIQUETAS_TIPO[p.tipoDocumento] ?? p.tipoDocumento} ·{" "}
            {p.monedaPrimaria}
          </option>
        ))}
      </select>
      {aplicando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
