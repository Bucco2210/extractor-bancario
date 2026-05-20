"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Zap,
  Sparkles,
  Save,
  Trash2,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Formato = {
  id: string;
  perfilId: string;
  huella: string;
  resumenHuella: string;
  reglaRegex: string | null;
  reglaActiva: boolean;
  stats: {
    extraccionesOk: number;
    extraccionesFallidas: number;
    extraccionesIA: number;
    primerUso: string | null;
    ultimoUso: string | null;
  };
  notas: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

type Perfil = {
  id: string;
  slug: string;
  nombre: string;
  entidad: { slug: string; nombre: string };
};

type ResultadoProbar = {
  lineasTotal: number;
  lineasPlausibles: number;
  lineasMatcheadas: number;
  matchRate: number;
  errorCompilacion: string | null;
  totalMovimientos: number;
  muestra: Array<{
    fecha: string;
    descripcion: string;
    debito: number | null;
    credito: number | null;
    saldo: number | null;
  }>;
};

const FMT_NUM = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function FormatosClient({ esAdmin }: { esAdmin: boolean }) {
  const [formatos, setFormatos] = useState<Formato[] | null>(null);
  const [perfiles, setPerfiles] = useState<Map<string, Perfil>>(new Map());
  const [filtroEntidad, setFiltroEntidad] = useState("");
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [recargarTick, setRecargarTick] = useState(0);

  const recargar = useCallback(() => {
    setRecargarTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setFormatos(null);
      try {
        const url = new URL("/api/formatos", window.location.origin);
        if (filtroEntidad.trim()) {
          url.searchParams.set("entidad", filtroEntidad.trim().toLowerCase());
        }
        url.searchParams.set("limite", "100");
        const res = await fetch(url, { cache: "no-store" });
        if (cancelado) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: Formato[] };
        if (!cancelado) setFormatos(data.items);
      } catch (err) {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : "Error desconocido";
        toast.error(`No pude cargar formatos: ${msg}`);
        setFormatos([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [filtroEntidad, recargarTick]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/perfiles?limite=200", {
          cache: "no-store",
        });
        if (!res.ok || cancelado) return;
        const data = (await res.json()) as { items: Perfil[] };
        if (!cancelado) {
          setPerfiles(new Map(data.items.map((p) => [p.id, p])));
        }
      } catch {
        // Silencio: la UI sigue funcionando, solo no mostramos el nombre.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const seleccion = formatos?.find((f) => f.id === seleccionId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <ListaFormatos
        formatos={formatos}
        perfiles={perfiles}
        seleccionId={seleccionId}
        filtroEntidad={filtroEntidad}
        onFiltroChange={setFiltroEntidad}
        onSeleccionar={setSeleccionId}
        onRefresh={recargar}
      />
      {seleccion ? (
        <DetalleFormato
          key={seleccion.id}
          formato={seleccion}
          perfil={perfiles.get(seleccion.perfilId)}
          esAdmin={esAdmin}
          onCambio={recargar}
        />
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
          Elegí un formato de la lista para ver el detalle y editar la regla.
        </div>
      )}
    </div>
  );
}

function ListaFormatos({
  formatos,
  perfiles,
  seleccionId,
  filtroEntidad,
  onFiltroChange,
  onSeleccionar,
  onRefresh,
}: {
  formatos: Formato[] | null;
  perfiles: Map<string, Perfil>;
  seleccionId: string | null;
  filtroEntidad: string;
  onFiltroChange: (v: string) => void;
  onSeleccionar: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="filtro-entidad"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Filtrar por entidad (slug)
          </label>
          <Input
            id="filtro-entidad"
            placeholder="galicia, mercado_pago, …"
            value={filtroEntidad}
            onChange={(e) => onFiltroChange(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Recargar
        </Button>
      </div>

      {formatos === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : formatos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay formatos aprendidos todavía. Cada extracción exitosa con IA
          registra automáticamente uno.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {formatos.map((f) => {
            const perfil = perfiles.get(f.perfilId);
            const seleccionada = f.id === seleccionId;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionar(f.id)}
                  className={`flex w-full flex-col gap-1 rounded-md border bg-card p-3 text-left text-sm transition-colors ${
                    seleccionada
                      ? "border-primary ring-1 ring-primary/30"
                      : "hover:border-primary/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {perfil
                        ? `${perfil.entidad.nombre} · ${perfil.nombre}`
                        : `perfil ${f.perfilId.slice(-6)}`}
                    </span>
                    {f.reglaActiva ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        <Zap className="h-3 w-3" /> regla activa
                      </span>
                    ) : f.reglaRegex ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        regla pausada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                        <Sparkles className="h-3 w-3" /> solo IA
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    OK {f.stats.extraccionesOk} · IA {f.stats.extraccionesIA} ·
                    fallos {f.stats.extraccionesFallidas}
                  </div>
                  <code className="text-[10px] text-muted-foreground">
                    {f.huella.slice(0, 16)}…
                  </code>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DetalleFormato({
  formato,
  perfil,
  esAdmin,
  onCambio,
}: {
  formato: Formato;
  perfil: Perfil | undefined;
  esAdmin: boolean;
  onCambio: () => void;
}) {
  const [reglaRegex, setReglaRegex] = useState(formato.reglaRegex ?? "");
  const [reglaActiva, setReglaActiva] = useState(formato.reglaActiva);
  const [notas, setNotas] = useState(formato.notas);
  const [guardando, setGuardando] = useState(false);
  const [resultadoProbar, setResultadoProbar] =
    useState<ResultadoProbar | null>(null);
  const [textoProbar, setTextoProbar] = useState("");
  const [probando, setProbando] = useState(false);

  async function guardar() {
    if (!esAdmin) return;
    setGuardando(true);
    try {
      const body: Record<string, unknown> = {
        reglaRegex: reglaRegex.trim() ? reglaRegex : null,
        reglaActiva,
        notas,
      };
      const res = await fetch(`/api/formatos/${formato.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { mensaje?: string };
      if (!res.ok) {
        toast.error(json.mensaje ?? "Error al guardar.");
        return;
      }
      toast.success("Formato actualizado.");
      onCambio();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!esAdmin) return;
    if (!confirm("¿Borrar este formato? (soft delete: reglaActiva pasa a false)")) {
      return;
    }
    try {
      const res = await fetch(`/api/formatos/${formato.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          mensaje?: string;
        };
        toast.error(json.mensaje ?? "Error al borrar.");
        return;
      }
      toast.success("Formato desactivado.");
      onCambio();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    }
  }

  async function probar() {
    setProbando(true);
    setResultadoProbar(null);
    try {
      const res = await fetch(`/api/formatos/${formato.id}/probar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: textoProbar,
          reglaRegex: reglaRegex.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.mensaje ?? "Error al probar.");
        return;
      }
      setResultadoProbar(json as ResultadoProbar);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {perfil
            ? `${perfil.entidad.nombre} · ${perfil.nombre}`
            : `Perfil ${formato.perfilId}`}
        </h2>
        <code className="text-[10px] text-muted-foreground">
          huella {formato.huella}
        </code>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Por regla" value={formato.stats.extraccionesOk} />
        <Stat label="Por IA" value={formato.stats.extraccionesIA} />
        <Stat
          label="Fallos regla"
          value={formato.stats.extraccionesFallidas}
          danger={formato.stats.extraccionesFallidas > 0}
        />
      </div>

      <details className="rounded-md border bg-muted/30 text-xs">
        <summary className="cursor-pointer px-3 py-2 text-muted-foreground">
          Resumen normalizado de la huella ({formato.resumenHuella.split("\n").length} líneas)
        </summary>
        <pre className="overflow-x-auto px-3 pb-3 text-[11px]">
          {formato.resumenHuella}
        </pre>
      </details>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="regla-regex"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Regla regex (grupos requeridos: <code>fecha</code>, <code>descripcion</code>;
          opcionales: <code>referencia</code>, <code>debito</code>, <code>credito</code>, <code>saldo</code>)
        </label>
        <textarea
          id="regla-regex"
          rows={4}
          value={reglaRegex}
          onChange={(e) => setReglaRegex(e.target.value)}
          disabled={!esAdmin}
          placeholder={'^(?<fecha>\\d{2}/\\d{2}/\\d{2,4})\\s+(?<descripcion>.+?)\\s+(?<debito>-?\\d[\\d.,]*)?\\s+(?<credito>-?\\d[\\d.,]*)?\\s+(?<saldo>-?\\d[\\d.,]*)$'}
          className="rounded border bg-background p-2 font-mono text-xs"
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <input
          id="regla-activa"
          type="checkbox"
          checked={reglaActiva}
          onChange={(e) => setReglaActiva(e.target.checked)}
          disabled={!esAdmin}
        />
        <label htmlFor="regla-activa">Regla activa</label>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="notas"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Notas
        </label>
        <textarea
          id="notas"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          disabled={!esAdmin}
          placeholder="contexto, casos raros, fechas relevantes…"
          className="rounded border bg-background p-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={guardar}
            disabled={!esAdmin || guardando}
          >
            {guardando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={borrar}
            disabled={!esAdmin}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Borrar (soft)
          </Button>
        </div>
        {!esAdmin ? (
          <span className="text-xs text-muted-foreground">
            Solo lectura — rol admin para editar.
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <label
          htmlFor="texto-probar"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Probar regla contra un texto de muestra
        </label>
        <textarea
          id="texto-probar"
          rows={6}
          value={textoProbar}
          onChange={(e) => setTextoProbar(e.target.value)}
          placeholder="Pegá acá las líneas del PDF para ver cuántas matchean."
          className="rounded border bg-background p-2 font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={probar}
          disabled={probando || textoProbar.length < 20}
          className="self-start"
        >
          {probando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="mr-2 h-4 w-4" />
          )}
          Probar regla
        </Button>

        {resultadoProbar ? (
          <ResultadoProbarBox resultado={resultadoProbar} />
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2 ${danger && value > 0 ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}
    >
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ResultadoProbarBox({ resultado }: { resultado: ResultadoProbar }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-xs">
      {resultado.errorCompilacion ? (
        <p className="text-destructive">
          Error compilando regex: {resultado.errorCompilacion}
        </p>
      ) : (
        <>
          <p>
            <strong>{(resultado.matchRate * 100).toFixed(0)}%</strong> match-rate ·{" "}
            {resultado.lineasMatcheadas}/{resultado.lineasPlausibles} líneas
            plausibles matcheadas ·{" "}
            <strong>{resultado.totalMovimientos}</strong> movimientos detectados
          </p>
          {resultado.muestra.length > 0 ? (
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Fecha</th>
                  <th className="text-left">Descripción</th>
                  <th className="text-right">Débito</th>
                  <th className="text-right">Crédito</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {resultado.muestra.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td>{m.fecha}</td>
                    <td>{m.descripcion}</td>
                    <td className="text-right tabular-nums">
                      {m.debito === null ? "" : FMT_NUM.format(m.debito)}
                    </td>
                    <td className="text-right tabular-nums">
                      {m.credito === null ? "" : FMT_NUM.format(m.credito)}
                    </td>
                    <td className="text-right tabular-nums">
                      {m.saldo === null ? "" : FMT_NUM.format(m.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </div>
  );
}
