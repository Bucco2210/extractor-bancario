"use client";

import { useEffect, useRef } from "react";
import {
  deserializarDesdeMongo,
  serializarParaMongo,
  useWorkspaceStore,
  type PestanaWorkspace,
} from "@/stores/workspace";

const DEBOUNCE_MS = 500;

/**
 * Hidrata el store desde Mongo en mount si todavía no fue hidratado, y
 * persiste cada cambio a Mongo (debounced). Pensado para montarse una
 * sola vez en el layout del workspace.
 */
export function useWorkspaceSync(): void {
  const hidratada = useWorkspaceStore((s) => s.hidratada);
  const pestanas = useWorkspaceStore((s) => s.pestanas);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const hidratar = useWorkspaceStore((s) => s.hidratar);
  const marcarHidratado = useWorkspaceStore((s) => s.marcarHidratado);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaFirma = useRef<string>("");

  // Hidratación inicial.
  useEffect(() => {
    if (hidratada) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/usuarios/pestanas", { cache: "no-store" });
        if (cancelado) return;
        if (!res.ok) {
          marcarHidratado();
          return;
        }
        const data = (await res.json()) as {
          pestanas: Array<{
            id?: string;
            extraccionId?: string | null;
            titulo?: string;
            perfilId?: string | null;
            activa?: boolean;
          }>;
        };
        if (cancelado) return;
        const { pestanas: remoto, activeId: aId } = deserializarDesdeMongo(
          data.pestanas ?? [],
        );
        const { pestanas: local } = useWorkspaceStore.getState();
        // Si el local está vacío, traemos lo de Mongo. Si no, mantenemos
        // local (esta máquina manda) — el próximo PUT escribirá local.
        if (local.length === 0 && remoto.length > 0) {
          hidratar({ pestanas: remoto, activeId: aId });
        } else {
          marcarHidratado();
        }
      } catch {
        if (!cancelado) marcarHidratado();
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [hidratada, hidratar, marcarHidratado]);

  // Persistencia a Mongo (debounced).
  useEffect(() => {
    if (!hidratada) return;
    const payload = serializarParaMongo(pestanas, activeId);
    const firma = JSON.stringify(payload);
    if (firma === ultimaFirma.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      ultimaFirma.current = firma;
      void fetch("/api/usuarios/pestanas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pestanas: payload }),
      }).catch(() => {
        // Falla silenciosa: localStorage ya guardó. Próximo cambio reintenta.
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pestanas, activeId, hidratada]);
}

/**
 * Helper para abrir una pestaña con manejo de límite + toast desde el
 * caller. Devuelve true si abrió/reactivó; false si se rechazó por
 * límite.
 */
export function abrirPestanaConLimite(
  input: {
    extraccionId: string;
    titulo: string;
    perfilId?: string | null;
    limite?: number;
  },
): { ok: true; id: string } | { ok: false; razon: "limite" } {
  const id = useWorkspaceStore.getState().abrir(input);
  if (id === null) return { ok: false, razon: "limite" };
  return { ok: true, id };
}

export type { PestanaWorkspace };
