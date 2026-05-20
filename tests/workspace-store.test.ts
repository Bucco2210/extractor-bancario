import { describe, it, expect, beforeEach } from "vitest";
import {
  deserializarDesdeMongo,
  reducirCerrar,
  serializarParaMongo,
  useWorkspaceStore,
  type PestanaWorkspace,
} from "../app/stores/workspace";

function reset() {
  useWorkspaceStore.setState({ pestanas: [], activeId: null, hidratada: false });
}

beforeEach(() => {
  reset();
});

describe("workspace store — abrir", () => {
  it("crea una pestaña y la activa", () => {
    const id = useWorkspaceStore
      .getState()
      .abrir({ extraccionId: "e1", titulo: "Galicia · 10/2025" });
    const s = useWorkspaceStore.getState();
    expect(id).not.toBeNull();
    expect(s.pestanas).toHaveLength(1);
    expect(s.activeId).toBe(id);
  });

  it("dedupea por extraccionId y reactiva la existente", () => {
    const a = useWorkspaceStore
      .getState()
      .abrir({ extraccionId: "e1", titulo: "Galicia" });
    useWorkspaceStore
      .getState()
      .abrir({ extraccionId: "e2", titulo: "BBVA" });
    // reactiva la 1 sin crear duplicado
    const b = useWorkspaceStore
      .getState()
      .abrir({ extraccionId: "e1", titulo: "Galicia (segunda intento)" });
    const s = useWorkspaceStore.getState();
    expect(s.pestanas).toHaveLength(2);
    expect(b).toBe(a);
    expect(s.activeId).toBe(a);
  });

  it("respeta el límite y devuelve null cuando se supera", () => {
    for (let i = 0; i < 3; i++) {
      const id = useWorkspaceStore
        .getState()
        .abrir({ extraccionId: `e${i}`, titulo: `Tab ${i}`, limite: 3 });
      expect(id).not.toBeNull();
    }
    const cuarta = useWorkspaceStore
      .getState()
      .abrir({ extraccionId: "e3", titulo: "Tab 3", limite: 3 });
    expect(cuarta).toBeNull();
    expect(useWorkspaceStore.getState().pestanas).toHaveLength(3);
  });
});

describe("workspace store — cerrar", () => {
  it("auto-activa la pestaña a la derecha al cerrar la activa", () => {
    const a = useWorkspaceStore.getState().abrir({ extraccionId: "e1", titulo: "A" })!;
    const b = useWorkspaceStore.getState().abrir({ extraccionId: "e2", titulo: "B" })!;
    const c = useWorkspaceStore.getState().abrir({ extraccionId: "e3", titulo: "C" })!;
    useWorkspaceStore.getState().activar(b);
    useWorkspaceStore.getState().cerrar(b);
    const s = useWorkspaceStore.getState();
    expect(s.pestanas.map((p) => p.id)).toEqual([a, c]);
    expect(s.activeId).toBe(c);
  });

  it("activa la pestaña a la izquierda si no hay nada a la derecha", () => {
    const a = useWorkspaceStore.getState().abrir({ extraccionId: "e1", titulo: "A" })!;
    const b = useWorkspaceStore.getState().abrir({ extraccionId: "e2", titulo: "B" })!;
    useWorkspaceStore.getState().activar(b);
    useWorkspaceStore.getState().cerrar(b);
    expect(useWorkspaceStore.getState().activeId).toBe(a);
  });

  it("activeId queda null al cerrar la última", () => {
    const a = useWorkspaceStore.getState().abrir({ extraccionId: "e1", titulo: "A" })!;
    useWorkspaceStore.getState().cerrar(a);
    expect(useWorkspaceStore.getState().activeId).toBeNull();
    expect(useWorkspaceStore.getState().pestanas).toEqual([]);
  });

  it("cerrar una no activa no cambia activeId", () => {
    const a = useWorkspaceStore.getState().abrir({ extraccionId: "e1", titulo: "A" })!;
    const b = useWorkspaceStore.getState().abrir({ extraccionId: "e2", titulo: "B" })!;
    useWorkspaceStore.getState().activar(a);
    useWorkspaceStore.getState().cerrar(b);
    expect(useWorkspaceStore.getState().activeId).toBe(a);
  });

  it("cerrarTodas vacía el estado", () => {
    useWorkspaceStore.getState().abrir({ extraccionId: "e1", titulo: "A" });
    useWorkspaceStore.getState().abrir({ extraccionId: "e2", titulo: "B" });
    useWorkspaceStore.getState().cerrarTodas();
    expect(useWorkspaceStore.getState().pestanas).toEqual([]);
    expect(useWorkspaceStore.getState().activeId).toBeNull();
  });
});

describe("workspace store — renombrar / setPerfilId", () => {
  it("renombrar cambia solo el titulo de la pestaña indicada", () => {
    const a = useWorkspaceStore.getState().abrir({ extraccionId: "e1", titulo: "A" })!;
    const b = useWorkspaceStore.getState().abrir({ extraccionId: "e2", titulo: "B" })!;
    useWorkspaceStore.getState().renombrar(a, "Nuevo título A");
    const s = useWorkspaceStore.getState();
    expect(s.pestanas.find((p) => p.id === a)?.titulo).toBe("Nuevo título A");
    expect(s.pestanas.find((p) => p.id === b)?.titulo).toBe("B");
  });

  it("setPerfilId acepta null para limpiar", () => {
    const a = useWorkspaceStore
      .getState()
      .abrir({ extraccionId: "e1", titulo: "A", perfilId: "p1" })!;
    useWorkspaceStore.getState().setPerfilId(a, null);
    expect(useWorkspaceStore.getState().pestanas[0]?.perfilId).toBeNull();
  });
});

describe("reducirCerrar (pura)", () => {
  const base: PestanaWorkspace[] = [
    { id: "1", extraccionId: "e1", titulo: "A", perfilId: null },
    { id: "2", extraccionId: "e2", titulo: "B", perfilId: null },
    { id: "3", extraccionId: "e3", titulo: "C", perfilId: null },
  ];

  it("devuelve estado intacto si el id no existe", () => {
    const r = reducirCerrar(base, "2", "99");
    expect(r.pestanas).toEqual(base);
    expect(r.activeId).toBe("2");
  });

  it("cierra activa del medio → activa derecha", () => {
    const r = reducirCerrar(base, "2", "2");
    expect(r.pestanas.map((p) => p.id)).toEqual(["1", "3"]);
    expect(r.activeId).toBe("3");
  });

  it("cierra activa del extremo derecho → activa izquierda", () => {
    const r = reducirCerrar(base, "3", "3");
    expect(r.pestanas.map((p) => p.id)).toEqual(["1", "2"]);
    expect(r.activeId).toBe("2");
  });
});

describe("(de)serializar Mongo", () => {
  it("ida y vuelta preserva pestañas y activeId", () => {
    const pestanas: PestanaWorkspace[] = [
      { id: "1", extraccionId: "e1", titulo: "A", perfilId: "p1" },
      { id: "2", extraccionId: "e2", titulo: "B", perfilId: null },
    ];
    const ser = serializarParaMongo(pestanas, "2");
    expect(ser[0]?.activa).toBe(false);
    expect(ser[1]?.activa).toBe(true);
    const back = deserializarDesdeMongo(ser);
    expect(back.pestanas).toEqual(pestanas);
    expect(back.activeId).toBe("2");
  });

  it("deserializar default activeId al primero si ninguno tiene activa=true", () => {
    const back = deserializarDesdeMongo([
      { id: "1", extraccionId: "e1", titulo: "A", perfilId: null, activa: false },
      { id: "2", extraccionId: "e2", titulo: "B", perfilId: null, activa: false },
    ]);
    expect(back.activeId).toBe("1");
  });

  it("deserializar filtra items sin id/extraccionId/titulo", () => {
    const back = deserializarDesdeMongo([
      { id: "", extraccionId: "e1", titulo: "A" },
      { id: "1", extraccionId: "e1", titulo: "A" },
      { id: "2", extraccionId: undefined, titulo: "B" },
    ]);
    expect(back.pestanas).toHaveLength(1);
    expect(back.pestanas[0]?.id).toBe("1");
  });
});
