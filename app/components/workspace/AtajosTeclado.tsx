"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspace";

/**
 * Maneja los atajos de teclado del workspace. Se monta una sola vez
 * desde el contenedor principal.
 *
 * - Cmd/Ctrl + W       → cerrar pestaña activa
 * - Cmd/Ctrl + Shift+W → cerrar todas
 * - Cmd/Ctrl + 1..9    → activar pestaña N (por posición)
 */
export function AtajosTecladoWorkspace() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Cmd/Ctrl+W
      if (e.key.toLowerCase() === "w" && !e.shiftKey) {
        const { activeId, cerrar } = useWorkspaceStore.getState();
        if (activeId) {
          e.preventDefault();
          cerrar(activeId);
        }
        return;
      }

      // Cmd/Ctrl+Shift+W
      if (e.key.toLowerCase() === "w" && e.shiftKey) {
        const { pestanas, cerrarTodas } = useWorkspaceStore.getState();
        if (pestanas.length > 0) {
          e.preventDefault();
          cerrarTodas();
        }
        return;
      }

      // Cmd/Ctrl+1..9
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const { pestanas, activar } = useWorkspaceStore.getState();
        const objetivo = pestanas[idx];
        if (objetivo) {
          e.preventDefault();
          activar(objetivo.id);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
