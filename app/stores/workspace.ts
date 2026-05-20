"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const MAX_PESTANAS_ABIERTAS_DEFAULT = 15;

export type PestanaWorkspace = {
  id: string;
  extraccionId: string;
  titulo: string;
  perfilId: string | null;
};

export type WorkspaceState = {
  pestanas: PestanaWorkspace[];
  activeId: string | null;
  hidratada: boolean;
};

export type WorkspaceActions = {
  /**
   * Abre una pestaña para la extracción. Si ya hay una pestaña con el mismo
   * extraccionId, la reactiva en vez de crear duplicado. Si se supera el
   * límite, devuelve null y no abre nada (el caller muestra el toast).
   */
  abrir: (input: {
    extraccionId: string;
    titulo: string;
    perfilId?: string | null;
    limite?: number;
  }) => string | null;
  cerrar: (id: string) => void;
  cerrarTodas: () => void;
  activar: (id: string) => void;
  renombrar: (id: string, titulo: string) => void;
  setPerfilId: (id: string, perfilId: string | null) => void;
  hidratar: (input: {
    pestanas: PestanaWorkspace[];
    activeId: string | null;
  }) => void;
  marcarHidratado: () => void;
};

function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Reducer puro de la acción "cerrar": elimina la pestaña y, si era la
 * activa, elige la adyacente (a la derecha si hay, sino a la izquierda).
 * Devuelve el nuevo array y el nuevo activeId.
 */
export function reducirCerrar(
  pestanas: PestanaWorkspace[],
  activeId: string | null,
  idACerrar: string,
): { pestanas: PestanaWorkspace[]; activeId: string | null } {
  const idx = pestanas.findIndex((p) => p.id === idACerrar);
  if (idx === -1) return { pestanas, activeId };
  const restantes = [...pestanas.slice(0, idx), ...pestanas.slice(idx + 1)];
  if (activeId !== idACerrar) {
    return { pestanas: restantes, activeId };
  }
  if (restantes.length === 0) {
    return { pestanas: restantes, activeId: null };
  }
  const proximo = restantes[idx] ?? restantes[idx - 1] ?? restantes[0];
  return { pestanas: restantes, activeId: proximo?.id ?? null };
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      pestanas: [],
      activeId: null,
      hidratada: false,

      abrir: ({ extraccionId, titulo, perfilId, limite }) => {
        const lim = limite ?? MAX_PESTANAS_ABIERTAS_DEFAULT;
        const { pestanas } = get();
        const existente = pestanas.find((p) => p.extraccionId === extraccionId);
        if (existente) {
          set({ activeId: existente.id });
          return existente.id;
        }
        if (pestanas.length >= lim) return null;
        const nueva: PestanaWorkspace = {
          id: nuevoId(),
          extraccionId,
          titulo,
          perfilId: perfilId ?? null,
        };
        set({
          pestanas: [...pestanas, nueva],
          activeId: nueva.id,
        });
        return nueva.id;
      },

      cerrar: (id) => {
        const { pestanas, activeId } = get();
        const next = reducirCerrar(pestanas, activeId, id);
        set(next);
      },

      cerrarTodas: () => set({ pestanas: [], activeId: null }),

      activar: (id) => {
        const { pestanas } = get();
        if (!pestanas.some((p) => p.id === id)) return;
        set({ activeId: id });
      },

      renombrar: (id, titulo) => {
        set((state) => ({
          pestanas: state.pestanas.map((p) =>
            p.id === id ? { ...p, titulo } : p,
          ),
        }));
      },

      setPerfilId: (id, perfilId) => {
        set((state) => ({
          pestanas: state.pestanas.map((p) =>
            p.id === id ? { ...p, perfilId } : p,
          ),
        }));
      },

      hidratar: ({ pestanas, activeId }) => {
        set({ pestanas, activeId, hidratada: true });
      },

      marcarHidratado: () => set({ hidratada: true }),
    }),
    {
      name: "byb-workspace",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return localStorage;
        // Storage fallback en memoria para SSR / tests — evita que el
        // middleware persist explote al hacer setItem en undefined.
        const mapa = new Map<string, string>();
        const fake: Storage = {
          length: 0,
          clear: () => mapa.clear(),
          getItem: (k) => mapa.get(k) ?? null,
          key: (i) => Array.from(mapa.keys())[i] ?? null,
          removeItem: (k) => {
            mapa.delete(k);
          },
          setItem: (k, v) => {
            mapa.set(k, v);
          },
        };
        return fake;
      }),
      partialize: (state) => ({
        pestanas: state.pestanas,
        activeId: state.activeId,
      }),
      // `hidratada` se setea explícitamente desde el sync con Mongo —
      // no debe sobrevivir entre sesiones del navegador.
    },
  ),
);

/**
 * Convierte el estado del store al shape que persiste Mongo
 * (`usuarios.preferencias.pestanasAbiertas`).
 */
export function serializarParaMongo(
  pestanas: PestanaWorkspace[],
  activeId: string | null,
): Array<{
  id: string;
  extraccionId: string;
  titulo: string;
  perfilId: string | null;
  activa: boolean;
}> {
  return pestanas.map((p) => ({
    id: p.id,
    extraccionId: p.extraccionId,
    titulo: p.titulo,
    perfilId: p.perfilId,
    activa: p.id === activeId,
  }));
}

/**
 * Inversa de `serializarParaMongo` — recupera pestanas + activeId desde
 * el shape persistido en Mongo.
 */
export function deserializarDesdeMongo(
  raw: Array<{
    id?: string;
    extraccionId?: string | null;
    titulo?: string;
    perfilId?: string | null;
    activa?: boolean;
  }>,
): { pestanas: PestanaWorkspace[]; activeId: string | null } {
  const pestanas: PestanaWorkspace[] = [];
  let activeId: string | null = null;
  for (const r of raw) {
    if (!r.id || !r.extraccionId || !r.titulo) continue;
    pestanas.push({
      id: r.id,
      extraccionId: r.extraccionId,
      titulo: r.titulo,
      perfilId: r.perfilId ?? null,
    });
    if (r.activa) activeId = r.id;
  }
  if (!activeId && pestanas.length > 0) activeId = pestanas[0]!.id;
  return { pestanas, activeId };
}
