"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import {
  STORAGE_KEY,
  aplicarTemaAlDom,
  leerPreferencia,
  resolverTema,
  type PreferenciaTema,
} from "@/lib/tema";

/** Sin suscriptores reales — solo recalculamos en cliclos. */
function suscribir(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", cb);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", cb);
  return () => {
    window.removeEventListener("storage", cb);
    media.removeEventListener("change", cb);
  };
}

function leerCliente(): PreferenciaTema {
  if (typeof window === "undefined") return "system";
  return leerPreferencia(window.localStorage.getItem(STORAGE_KEY));
}

function leerServidor(): PreferenciaTema {
  return "system";
}

/**
 * Botón cíclico: system → light → dark → system.
 * El script anti-flash del root layout ya aplicó la clase `.dark` antes
 * del primer paint; este componente solo refresca el ícono y reacciona
 * a cambios del SO cuando la preferencia es "system".
 */
export function ToggleTema() {
  const pref = useSyncExternalStore(suscribir, leerCliente, leerServidor);

  // Re-aplicar la clase si el SO cambia mientras estamos en "system".
  useEffect(() => {
    if (pref !== "system") return;
    const sistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
    aplicarTemaAlDom(resolverTema(null, sistema));
  }, [pref]);

  function ciclar(): void {
    const siguiente: PreferenciaTema =
      pref === "system" ? "light" : pref === "light" ? "dark" : "system";

    if (siguiente === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
      const sistema = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      aplicarTemaAlDom(resolverTema(null, sistema));
    } else {
      window.localStorage.setItem(STORAGE_KEY, siguiente);
      aplicarTemaAlDom(siguiente);
    }
    // Disparar 'storage' manualmente — no se dispara para el mismo tab.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }

  const Icono = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const etiqueta =
    pref === "dark"
      ? "Modo oscuro"
      : pref === "light"
        ? "Modo claro"
        : "Modo del sistema";

  return (
    <button
      type="button"
      onClick={ciclar}
      aria-label={`Cambiar tema (actual: ${etiqueta})`}
      title={etiqueta}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icono className="h-4 w-4" />
      <span className="sr-only">{etiqueta}</span>
    </button>
  );
}
