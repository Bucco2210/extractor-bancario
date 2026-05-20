"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace";
import { useWorkspaceSync } from "./sync";
import { WorkspaceBar } from "./WorkspaceBar";
import { SelectorPerfil } from "./SelectorPerfil";
import { AtajosTecladoWorkspace } from "./AtajosTeclado";
import { WorkspaceVacio } from "./WorkspaceVacio";
import { VistaEstadoExtraccion } from "@/components/extracciones/EstadoExtraccion";

type EstadoMinimo = {
  banco?: string | null;
  periodo?: string | null;
  perfilId?: string | null;
};

function WorkspaceContent() {
  const router = useRouter();
  const search = useSearchParams();
  useWorkspaceSync();

  const pestanas = useWorkspaceStore((s) => s.pestanas);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const hidratada = useWorkspaceStore((s) => s.hidratada);
  const cerrar = useWorkspaceStore((s) => s.cerrar);
  const activar = useWorkspaceStore((s) => s.activar);
  const renombrar = useWorkspaceStore((s) => s.renombrar);
  const setPerfilId = useWorkspaceStore((s) => s.setPerfilId);

  // Maneja ?abrir=<extraccionId> [&titulo=...] — abre y limpia el query.
  useEffect(() => {
    const abrir = search.get("abrir");
    if (!abrir) return;
    const tituloHint = search.get("titulo") ?? "Cargando…";
    const perfilIdHint = search.get("perfilId");
    const id = useWorkspaceStore.getState().abrir({
      extraccionId: abrir,
      titulo: tituloHint,
      perfilId: perfilIdHint ?? null,
    });
    if (id === null) {
      toast.error(
        "Llegaste al límite de pestañas abiertas. Cerrá alguna para abrir otra.",
      );
    }
    router.replace("/workspace");
  }, [search, router]);

  const activa = useMemo(
    () => pestanas.find((p) => p.id === activeId) ?? null,
    [pestanas, activeId],
  );

  // Cuando una pestaña tiene título "Cargando…" (abierta sin hint),
  // fetch la extracción una vez y actualizamos título + perfilId.
  const enriquecerPestana = useCallback(
    (idPestana: string, extraccionId: string) => {
      void (async () => {
        try {
          const res = await fetch(`/api/extracciones/${extraccionId}`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as EstadoMinimo;
          const banco = data.banco?.trim() ?? "Extracto";
          const periodo = data.periodo?.trim();
          const titulo = periodo ? `${banco} · ${periodo}` : banco;
          renombrar(idPestana, titulo);
          if (data.perfilId) setPerfilId(idPestana, data.perfilId);
        } catch {
          // Silencioso: la vista de detalle igual hace polling.
        }
      })();
    },
    [renombrar, setPerfilId],
  );

  useEffect(() => {
    if (!activa) return;
    if (activa.titulo === "Cargando…" || activa.titulo === "Extracto") {
      enriquecerPestana(activa.id, activa.extraccionId);
    }
  }, [activa, enriquecerPestana]);

  if (!hidratada) {
    return (
      <div className="px-4 py-8 text-sm text-muted-foreground">
        Cargando workspace…
      </div>
    );
  }

  if (pestanas.length === 0 || !activa) {
    return (
      <>
        <AtajosTecladoWorkspace />
        <WorkspaceVacio />
      </>
    );
  }

  return (
    <div className="-mx-6 -my-8 flex min-h-[calc(100vh-65px)] flex-col">
      <AtajosTecladoWorkspace />
      <WorkspaceBar
        pestanas={pestanas}
        activeId={activeId}
        onActivar={activar}
        onCerrar={cerrar}
      />
      <SelectorPerfil
        key={activa.extraccionId}
        extraccionId={activa.extraccionId}
        perfilIdActual={activa.perfilId}
        onCambiado={(nuevoPerfilId) => setPerfilId(activa.id, nuevoPerfilId)}
      />
      <div className="flex-1 px-6 py-6">
        <VistaEstadoExtraccion
          key={activa.extraccionId}
          id={activa.extraccionId}
        />
      </div>
    </div>
  );
}

export function Workspace() {
  return (
    <Suspense fallback={null}>
      <WorkspaceContent />
    </Suspense>
  );
}
