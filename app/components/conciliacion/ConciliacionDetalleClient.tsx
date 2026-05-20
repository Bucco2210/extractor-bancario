"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Download,
  RefreshCw,
  Trash2,
  Link2,
  Link2Off,
  EyeOff,
  Eye,
  Group,
  X,
  Save,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Movimiento = {
  fecha: string;
  descripcion: string;
  debito: number | null;
  credito: number | null;
  saldo: number | null;
};

type ConciliacionDTO = {
  id: string;
  extraccionId: string;
  nombre: string;
  estado: string;
  segundaFuente: {
    archivoNombre: string;
    formato: string;
    registros: Array<{
      idx: number;
      fecha: string | null;
      descripcion: string;
      monto: number | null;
      referencia: string | null;
    }>;
  };
  tolerancias: { dias: number; importe: number; fuzzyUmbral: number };
  matches: Array<{
    extractoIdx: number;
    registroIdx: number;
    score: number;
    confirmadoManualmente: boolean;
  }>;
  descartadosExtracto: number[];
  gruposManuales: Array<{
    extractoIdxs: number[];
    registroIdxs: number[];
    nota: string;
    creadoEn: string;
  }>;
  estadisticas: {
    totalExtracto: number;
    totalSegundaFuente: number;
    matcheados: number;
    huerfanosExtracto: number;
    huerfanosSegundaFuente: number;
    enGruposManuales: number;
  };
  notas: string;
};

const FMT_MONEDA = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "";
  return FMT_MONEDA.format(n);
}

function montoNetoMovimiento(m: Movimiento): number | null {
  if (m.credito === null && m.debito === null) return null;
  return (m.credito ?? 0) - (m.debito ?? 0);
}

export function ConciliacionDetalleClient({ id }: { id: string }) {
  const [conc, setConc] = useState<ConciliacionDTO | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [selExtracto, setSelExtracto] = useState<Set<number>>(new Set());
  const [selRegistro, setSelRegistro] = useState<Set<number>>(new Set());
  const [nombreEditado, setNombreEditado] = useState<string | null>(null);
  const [tolDias, setTolDias] = useState<string>("");
  const [tolImporte, setTolImporte] = useState<string>("");
  const [tolFuzzy, setTolFuzzy] = useState<string>("");
  const [notaGrupo, setNotaGrupo] = useState<string>("");

  const recargar = useCallback(async (): Promise<ConciliacionDTO | null> => {
    try {
      const res = await fetch(`/api/conciliaciones/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.mensaje ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ConciliacionDTO;
      setConc(data);
      setTolDias(String(data.tolerancias.dias));
      setTolImporte(String(data.tolerancias.importe));
      setTolFuzzy(String(data.tolerancias.fuzzyUmbral));
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar.";
      toast.error(msg);
      return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      const c = await recargar();
      if (cancelado) return;
      if (!c) {
        setCargando(false);
        return;
      }
      try {
        const res = await fetch(`/api/extracciones/${c.extraccionId}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { movimientos: Movimiento[] };
        if (!cancelado) setMovimientos(data.movimientos);
      } catch (err) {
        if (!cancelado) {
          const msg =
            err instanceof Error ? err.message : "No pude cargar la extracción.";
          toast.error(msg);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, recargar]);

  const matchPorExtracto = useMemo(() => {
    const m = new Map<number, ConciliacionDTO["matches"][number]>();
    if (conc) for (const x of conc.matches) m.set(x.extractoIdx, x);
    return m;
  }, [conc]);
  const matchPorRegistro = useMemo(() => {
    const m = new Map<number, ConciliacionDTO["matches"][number]>();
    if (conc) for (const x of conc.matches) m.set(x.registroIdx, x);
    return m;
  }, [conc]);
  const descartados = useMemo(
    () => new Set(conc?.descartadosExtracto ?? []),
    [conc],
  );
  const grupoPorExtracto = useMemo(() => {
    const m = new Map<number, number>();
    if (conc) {
      conc.gruposManuales.forEach((g, gi) => {
        for (const i of g.extractoIdxs) m.set(i, gi);
      });
    }
    return m;
  }, [conc]);
  const grupoPorRegistro = useMemo(() => {
    const m = new Map<number, number>();
    if (conc) {
      conc.gruposManuales.forEach((g, gi) => {
        for (const i of g.registroIdxs) m.set(i, gi);
      });
    }
    return m;
  }, [conc]);

  const patch = useCallback(
    async (body: Record<string, unknown>, mensajeOk: string) => {
      setGuardando(true);
      try {
        const res = await fetch(`/api/conciliaciones/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.mensaje ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ConciliacionDTO;
        setConc(data);
        setTolDias(String(data.tolerancias.dias));
        setTolImporte(String(data.tolerancias.importe));
        setTolFuzzy(String(data.tolerancias.fuzzyUmbral));
        toast.success(mensajeOk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al guardar.";
        toast.error(msg);
      } finally {
        setGuardando(false);
      }
    },
    [id],
  );

  const forzarMatch = useCallback(async () => {
    if (selExtracto.size !== 1 || selRegistro.size !== 1) return;
    const [eIdx] = Array.from(selExtracto);
    const [rIdx] = Array.from(selRegistro);
    await patch(
      { forzarMatch: { extractoIdx: eIdx, registroIdx: rIdx } },
      "Match forzado.",
    );
    setSelExtracto(new Set());
    setSelRegistro(new Set());
  }, [selExtracto, selRegistro, patch]);

  const quitarMatch = useCallback(
    async (extractoIdx: number) => {
      await patch({ quitarMatch: { extractoIdx } }, "Match removido.");
    },
    [patch],
  );

  const descartar = useCallback(
    async (extractoIdx: number, descartarFlag: boolean) => {
      await patch(
        { descartarExtracto: { extractoIdx, descartar: descartarFlag } },
        descartarFlag ? "Descartado." : "Vuelto a la conciliación.",
      );
    },
    [patch],
  );

  const crearGrupo = useCallback(async () => {
    if (selExtracto.size === 0 || selRegistro.size === 0) return;
    await patch(
      {
        crearGrupoManual: {
          extractoIdxs: Array.from(selExtracto),
          registroIdxs: Array.from(selRegistro),
          nota: notaGrupo,
        },
      },
      `Grupo manual creado con ${selExtracto.size}+${selRegistro.size} ítems.`,
    );
    setSelExtracto(new Set());
    setSelRegistro(new Set());
    setNotaGrupo("");
  }, [selExtracto, selRegistro, notaGrupo, patch]);

  const eliminarGrupo = useCallback(
    async (indice: number) => {
      await patch(
        { eliminarGrupoManual: { indice } },
        `Grupo manual #${indice + 1} eliminado.`,
      );
    },
    [patch],
  );

  const reMatchear = useCallback(async () => {
    const body: Record<string, unknown> = { reMatchear: true };
    const dias = Number(tolDias);
    const importe = Number(tolImporte);
    const fuzzy = Number(tolFuzzy);
    if (
      Number.isFinite(dias) &&
      Number.isFinite(importe) &&
      Number.isFinite(fuzzy)
    ) {
      body.tolerancias = { dias, importe, fuzzyUmbral: fuzzy };
    }
    await patch(body, "Re-matcheado.");
  }, [tolDias, tolImporte, tolFuzzy, patch]);

  const guardarNombre = useCallback(async () => {
    if (nombreEditado === null || !conc) return;
    const limpio = nombreEditado.trim();
    if (!limpio || limpio === conc.nombre) {
      setNombreEditado(null);
      return;
    }
    await patch({ nombre: limpio }, "Nombre actualizado.");
    setNombreEditado(null);
  }, [nombreEditado, conc, patch]);

  if (cargando || !conc || !movimientos) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando conciliación…
      </div>
    );
  }

  const seleccionPermiteForzar = selExtracto.size === 1 && selRegistro.size === 1;
  const seleccionPermiteGrupo = selExtracto.size >= 1 && selRegistro.size >= 1;
  const stats = conc.estadisticas;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/conciliacion"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a conciliaciones
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/extracciones/${conc.extraccionId}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Ver extracto →
          </Link>
          <a
            href={`/api/conciliaciones/${conc.id}/excel`}
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </a>
        </div>
      </div>

      <header className="flex flex-col gap-2">
        {nombreEditado === null ? (
          <h1
            className="cursor-text text-2xl font-semibold tracking-tight"
            onClick={() => setNombreEditado(conc.nombre)}
            title="Click para editar"
          >
            {conc.nombre}
          </h1>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") guardarNombre();
                if (e.key === "Escape") setNombreEditado(null);
              }}
              className="max-w-md text-xl"
            />
            <Button size="sm" onClick={guardarNombre} disabled={guardando}>
              <Save className="mr-1 h-4 w-4" />
              Guardar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNombreEditado(null)}
            >
              Cancelar
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Segunda fuente: {conc.segundaFuente.archivoNombre} ·{" "}
          {conc.segundaFuente.formato.toUpperCase()} ·{" "}
          {conc.segundaFuente.registros.length} registros
        </p>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge color="emerald">{stats.matcheados} matcheados</Badge>
          <Badge color="amber">
            {stats.huerfanosExtracto + stats.huerfanosSegundaFuente} huérfanos
          </Badge>
          <Badge color="slate">{conc.descartadosExtracto.length} descartados</Badge>
          {stats.enGruposManuales > 0 ? (
            <Badge color="sky">
              {stats.enGruposManuales} en grupos manuales
            </Badge>
          ) : null}
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-md border bg-card/40 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tolerancia días</label>
          <Input
            type="number"
            min={0}
            max={60}
            value={tolDias}
            onChange={(e) => setTolDias(e.target.value)}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            Tolerancia importe ($)
          </label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={tolImporte}
            onChange={(e) => setTolImporte(e.target.value)}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Umbral fuzzy (0–1)</label>
          <Input
            type="number"
            min={0}
            max={1}
            step="0.05"
            value={tolFuzzy}
            onChange={(e) => setTolFuzzy(e.target.value)}
            className="w-24"
          />
        </div>
        <Button onClick={reMatchear} disabled={guardando} size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Re-matchear (preserva manuales)
        </Button>
      </section>

      {/* Barra de acciones contextual */}
      {selExtracto.size > 0 || selRegistro.size > 0 ? (
        <section className="flex flex-wrap items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-950/40">
          <span className="text-xs text-muted-foreground">
            Seleccionados: {selExtracto.size} del extracto, {selRegistro.size} de la
            segunda fuente.
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {seleccionPermiteForzar ? (
              <Button size="sm" onClick={forzarMatch} disabled={guardando}>
                <Link2 className="mr-1 h-4 w-4" />
                Forzar match 1:1
              </Button>
            ) : null}
            {seleccionPermiteGrupo ? (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nota del grupo (opcional)"
                  value={notaGrupo}
                  onChange={(e) => setNotaGrupo(e.target.value)}
                  className="w-56"
                />
                <Button size="sm" onClick={crearGrupo} disabled={guardando}>
                  <Group className="mr-1 h-4 w-4" />
                  Crear grupo manual
                </Button>
              </div>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelExtracto(new Set());
                setSelRegistro(new Set());
              }}
            >
              <X className="mr-1 h-4 w-4" />
              Limpiar
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Panel extracto */}
        <PanelLista
          titulo={`Extracto (${movimientos.length})`}
          filas={movimientos.map((m, idx) => {
            const match = matchPorExtracto.get(idx);
            const grupoIdx = grupoPorExtracto.get(idx);
            const monto = montoNetoMovimiento(m);
            return {
              idx,
              fecha: m.fecha,
              descripcion: m.descripcion,
              monto,
              estado: estadoExtracto(idx, match, descartados, grupoIdx),
              grupoIdx,
              seleccionado: selExtracto.has(idx),
              acciones: (
                <RowAcciones
                  match={match}
                  esDescartado={descartados.has(idx)}
                  estaEnGrupo={grupoIdx !== undefined}
                  onQuitarMatch={() => quitarMatch(idx)}
                  onDescartar={() => descartar(idx, true)}
                  onRecuperar={() => descartar(idx, false)}
                />
              ),
            };
          })}
          onToggle={(idx) => {
            setSelExtracto((prev) => {
              const n = new Set(prev);
              if (n.has(idx)) n.delete(idx);
              else n.add(idx);
              return n;
            });
          }}
        />

        {/* Panel segunda fuente */}
        <PanelLista
          titulo={`Segunda fuente (${conc.segundaFuente.registros.length})`}
          filas={conc.segundaFuente.registros.map((r) => {
            const match = matchPorRegistro.get(r.idx);
            const grupoIdx = grupoPorRegistro.get(r.idx);
            return {
              idx: r.idx,
              fecha: r.fecha,
              descripcion: r.descripcion,
              monto: r.monto,
              estado: estadoRegistro(match, grupoIdx),
              grupoIdx,
              seleccionado: selRegistro.has(r.idx),
              acciones: null,
            };
          })}
          onToggle={(idx) => {
            setSelRegistro((prev) => {
              const n = new Set(prev);
              if (n.has(idx)) n.delete(idx);
              else n.add(idx);
              return n;
            });
          }}
        />
      </div>

      {conc.gruposManuales.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-md border bg-card/40 p-3">
          <h2 className="text-sm font-medium">Grupos manuales</h2>
          <ul className="flex flex-col gap-2">
            {conc.gruposManuales.map((g, gi) => (
              <li
                key={gi}
                className="flex flex-col gap-1 rounded border bg-background px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    #{gi + 1} — {g.extractoIdxs.length} mov. del extracto +{" "}
                    {g.registroIdxs.length} reg. de la segunda fuente
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Extracto: [{g.extractoIdxs.join(", ")}] · Segunda fuente: [
                    {g.registroIdxs.join(", ")}]
                  </span>
                  {g.nota ? (
                    <span className="text-xs italic text-muted-foreground">
                      Nota: {g.nota}
                    </span>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => eliminarGrupo(gi)}
                  disabled={guardando}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ============================ Sub-componentes ============================ */

type FilaPanel = {
  idx: number;
  fecha: string | null;
  descripcion: string;
  monto: number | null;
  estado: { texto: string; color: ColorBadge };
  grupoIdx: number | undefined;
  seleccionado: boolean;
  acciones: React.ReactNode;
};

function PanelLista({
  titulo,
  filas,
  onToggle,
}: {
  titulo: string;
  filas: FilaPanel[];
  onToggle: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{titulo}</h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2 text-left font-medium">Fecha</th>
              <th className="px-2 py-2 text-left font-medium">Descripción</th>
              <th className="px-2 py-2 text-right font-medium">Monto</th>
              <th className="px-2 py-2 text-left font-medium">Estado</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Sin filas.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr
                  key={f.idx}
                  className={`border-t ${
                    f.seleccionado ? "bg-sky-50 dark:bg-sky-950/30" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={f.seleccionado}
                      onChange={() => onToggle(f.idx)}
                      className="h-3.5 w-3.5"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {f.fecha ?? ""}
                  </td>
                  <td className="px-2 py-1.5">{f.descripcion}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmt(f.monto)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge color={f.estado.color}>{f.estado.texto}</Badge>
                  </td>
                  <td className="px-2 py-1.5">{f.acciones}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowAcciones({
  match,
  esDescartado,
  estaEnGrupo,
  onQuitarMatch,
  onDescartar,
  onRecuperar,
}: {
  match: ConciliacionDTO["matches"][number] | undefined;
  esDescartado: boolean;
  estaEnGrupo: boolean;
  onQuitarMatch: () => void;
  onDescartar: () => void;
  onRecuperar: () => void;
}) {
  if (estaEnGrupo) return null;
  return (
    <div className="flex items-center gap-1">
      {match ? (
        <button
          onClick={onQuitarMatch}
          className="text-muted-foreground hover:text-destructive"
          title="Quitar match"
        >
          <Link2Off className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {esDescartado ? (
        <button
          onClick={onRecuperar}
          className="text-muted-foreground hover:text-foreground"
          title="Volver a la conciliación"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          onClick={onDescartar}
          className="text-muted-foreground hover:text-foreground"
          title="Descartar (no cuenta como huérfano)"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

type ColorBadge = "emerald" | "amber" | "slate" | "sky";

function Badge({
  color,
  children,
}: {
  color: ColorBadge;
  children: React.ReactNode;
}) {
  const map: Record<ColorBadge, string> = {
    emerald:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
    sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${map[color]}`}
    >
      {children}
    </span>
  );
}

type ConciliacionDTOMatch = ConciliacionDTO["matches"][number];

function estadoExtracto(
  _idx: number,
  match: ConciliacionDTOMatch | undefined,
  descartados: Set<number>,
  grupoIdx: number | undefined,
): { texto: string; color: ColorBadge } {
  if (grupoIdx !== undefined) {
    return { texto: `Grupo #${grupoIdx + 1}`, color: "sky" };
  }
  if (descartados.has(_idx)) {
    return { texto: "Descartado", color: "slate" };
  }
  if (match) {
    return {
      texto: match.confirmadoManualmente ? "Match manual" : "Match auto",
      color: "emerald",
    };
  }
  return { texto: "Huérfano", color: "amber" };
}

function estadoRegistro(
  match: ConciliacionDTOMatch | undefined,
  grupoIdx: number | undefined,
): { texto: string; color: ColorBadge } {
  if (grupoIdx !== undefined) {
    return { texto: `Grupo #${grupoIdx + 1}`, color: "sky" };
  }
  if (match) {
    return {
      texto: match.confirmadoManualmente ? "Match manual" : "Match auto",
      color: "emerald",
    };
  }
  return { texto: "Huérfano", color: "amber" };
}
