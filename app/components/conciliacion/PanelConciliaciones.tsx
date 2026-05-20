"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Upload, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ConciliacionLista = {
  id: string;
  extraccionId: string;
  nombre: string;
  estado: string;
  segundaFuente: { archivoNombre: string };
  estadisticas: {
    totalExtracto: number;
    totalSegundaFuente: number;
    matcheados: number;
    huerfanosExtracto: number;
    huerfanosSegundaFuente: number;
    enGruposManuales: number;
  };
  createdAt: string;
};

type MapeoIncompletoDetalles = {
  headers: string[];
  camposFaltantes: Array<"fecha" | "descripcion" | "monto">;
  filasSample: Array<Record<string, string>>;
};

const FMT_FECHA = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function PanelConciliaciones({ extraccionId }: { extraccionId: string }) {
  const [items, setItems] = useState<ConciliacionLista[] | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mapeoFaltante, setMapeoFaltante] =
    useState<MapeoIncompletoDetalles | null>(null);
  const [mapeoOverride, setMapeoOverride] = useState<{
    fecha: string;
    descripcion: string;
    monto: string;
    referencia: string;
  }>({ fecha: "", descripcion: "", monto: "", referencia: "" });
  const inputFileRef = useRef<HTMLInputElement>(null);

  const [recargarTick, setRecargarTick] = useState(0);
  const recargar = useCallback(() => setRecargarTick((n) => n + 1), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/conciliaciones?extraccionId=${extraccionId}&limite=50`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.mensaje ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { items: ConciliacionLista[] };
        if (!cancelado) setItems(data.items);
      } catch (err) {
        if (cancelado) return;
        const msg =
          err instanceof Error ? err.message : "Error al cargar conciliaciones.";
        toast.error(msg);
        setItems([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [extraccionId, recargarTick]);

  const enviar = useCallback(async () => {
    if (!archivo) {
      toast.error("Falta el archivo.");
      return;
    }
    if (!nombre.trim()) {
      toast.error("Ponele un nombre a la conciliación.");
      return;
    }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("extraccionId", extraccionId);
      fd.append("nombre", nombre.trim());
      if (mapeoFaltante) {
        const override: Record<string, string> = {
          fecha: mapeoOverride.fecha,
          descripcion: mapeoOverride.descripcion,
          monto: mapeoOverride.monto,
        };
        if (mapeoOverride.referencia) override.referencia = mapeoOverride.referencia;
        fd.append("mapeoOverride", JSON.stringify(override));
      }
      const res = await fetch("/api/conciliaciones", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as
        | { id: string }
        | {
            error: string;
            mensaje?: string;
            detalles?: MapeoIncompletoDetalles;
          }
        | null;
      if (!res.ok) {
        if (
          res.status === 422 &&
          json &&
          "error" in json &&
          json.error === "MAPEO_INCOMPLETO" &&
          json.detalles
        ) {
          setMapeoFaltante(json.detalles);
          toast.warning(
            "No detecté todas las columnas. Indicá los nombres exactos.",
          );
          return;
        }
        const msg =
          json && "mensaje" in json && json.mensaje
            ? json.mensaje
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success("Conciliación creada.");
      setMostrarForm(false);
      setArchivo(null);
      setNombre("");
      setMapeoFaltante(null);
      setMapeoOverride({ fecha: "", descripcion: "", monto: "", referencia: "" });
      if (inputFileRef.current) inputFileRef.current.value = "";
      recargar();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear.";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }, [archivo, nombre, extraccionId, mapeoFaltante, mapeoOverride, recargar]);

  if (items === null) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-card/40 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando conciliaciones…
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          Conciliaciones {items.length > 0 ? `(${items.length})` : ""}
        </h2>
        {!mostrarForm ? (
          <Button
            size="sm"
            onClick={() => setMostrarForm(true)}
            variant={items.length === 0 ? "default" : "outline"}
          >
            <Plus className="mr-1 h-4 w-4" />
            {items.length === 0 ? "Conciliar" : "Nueva conciliación"}
          </Button>
        ) : null}
      </div>

      {items.length === 0 && !mostrarForm ? (
        <p className="text-xs text-muted-foreground">
          Subí un CSV o XLSX con cobranzas o asientos para cruzarlos con los
          movimientos del extracto.
        </p>
      ) : null}

      {mostrarForm ? (
        <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Nombre de la conciliación
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Ventas marzo 2026 vs CA ARS"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Segunda fuente (CSV o XLSX, ≤ 10 MB)
            </label>
            <input
              ref={inputFileRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>

          {mapeoFaltante ? (
            <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              <p>
                <strong>Mapeá las columnas:</strong> el archivo tiene los headers{" "}
                <code>{mapeoFaltante.headers.join(", ")}</code> y faltan{" "}
                <code>{mapeoFaltante.camposFaltantes.join(", ")}</code>.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["fecha", "descripcion", "monto", "referencia"] as const).map(
                  (campo) => (
                    <div key={campo} className="flex flex-col gap-0.5">
                      <label className="text-[10px] uppercase text-muted-foreground">
                        {campo}
                        {campo !== "referencia" ? " *" : ""}
                      </label>
                      <select
                        value={mapeoOverride[campo]}
                        onChange={(e) =>
                          setMapeoOverride((m) => ({
                            ...m,
                            [campo]: e.target.value,
                          }))
                        }
                        className="rounded border bg-background px-2 py-1"
                      >
                        <option value="">— sin asignar —</option>
                        {mapeoFaltante.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={enviar} disabled={enviando}>
              {enviando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {mapeoFaltante ? "Reintentar con mapeo" : "Crear conciliación"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMostrarForm(false);
                setArchivo(null);
                setNombre("");
                setMapeoFaltante(null);
                if (inputFileRef.current) inputFileRef.current.value = "";
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => {
            const total = it.estadisticas.totalExtracto;
            const pct = total
              ? Math.round((it.estadisticas.matcheados / total) * 100)
              : 0;
            return (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{it.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {it.segundaFuente.archivoNombre} ·{" "}
                    {FMT_FECHA.format(new Date(it.createdAt))} ·{" "}
                    {it.estadisticas.matcheados}/{total} matcheados ({pct}%)
                  </span>
                </div>
                <Link
                  href={`/conciliacion/${it.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300"
                >
                  Abrir
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
