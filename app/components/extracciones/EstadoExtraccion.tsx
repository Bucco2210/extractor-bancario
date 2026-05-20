"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export type Movimiento = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  debito: number | null;
  credito: number | null;
  saldo: number | null;
};

export type ChunkFallido = {
  indice: number;
  paginas: number[];
  error: string;
};

export type EstadoExtraccion =
  | "pendiente"
  | "procesando"
  | "extraido"
  | "parcial"
  | "error";

export type EstadoServidor = {
  id: string;
  estado: EstadoExtraccion;
  banco: string | null;
  cuenta: string | null;
  periodo: string | null;
  titular: string | null;
  error: string | null;
  movimientos: Movimiento[];
  _meta: {
    modelo: string;
    tokensInput: number;
    tokensOutput: number;
    tiempoMs: number;
    paginasTotal: number;
    chunksTotal: number;
    chunksOk: number;
    chunksFallidos: ChunkFallido[];
  };
};

const INTERVALO_POLLING_MS = 1500;

const formatoMonedaArs = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtImporte(v: number | null): string {
  if (v === null || v === undefined) return "";
  return formatoMonedaArs.format(v);
}

function esEstadoTerminal(e: EstadoExtraccion): boolean {
  return e === "extraido" || e === "parcial" || e === "error";
}

export function VistaEstadoExtraccion({ id }: { id: string }) {
  const [estado, setEstado] = useState<EstadoServidor | null>(null);
  const [reanudando, setReanudando] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const [cargandoInicial, setCargandoInicial] = useState(true);

  const reanudar = useCallback(async () => {
    setReanudando(true);
    try {
      const res = await fetch(`/api/extracciones/${id}/reanudar`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { id: string; estado: "procesando"; chunksAProcesar: number }
        | { error: string; mensaje: string };
      if (!res.ok) {
        const msg = "mensaje" in json ? json.mensaje : "Error al reanudar.";
        toast.error(msg);
        return;
      }
      setEstado((prev) =>
        prev
          ? {
              ...prev,
              estado: "procesando",
              error: null,
              _meta: { ...prev._meta, chunksFallidos: [] },
            }
          : prev,
      );
      setPollTick((n) => n + 1);
      toast.info("Reanudación iniciada.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      toast.error(msg);
    } finally {
      setReanudando(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelado) return;
      try {
        const res = await fetch(`/api/extracciones/${id}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { mensaje?: string }
            | null;
          throw new Error(json?.mensaje ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as EstadoServidor;
        if (cancelado) return;
        setEstado(data);
        setCargandoInicial(false);
        if (!esEstadoTerminal(data.estado)) {
          timeoutId = setTimeout(tick, INTERVALO_POLLING_MS);
        } else if (data.estado === "extraido") {
          toast.success(`Se extrajeron ${data.movimientos.length} movimientos.`);
        } else if (data.estado === "parcial") {
          toast.warning(
            `Extracción parcial: ${data.movimientos.length} movimientos, ${data._meta.chunksFallidos.length} de ${data._meta.chunksTotal} bloques fallaron.`,
          );
        } else if (data.estado === "error") {
          toast.error(data.error ?? "Falló la extracción.");
        }
      } catch (err) {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : "Error de polling";
        toast.error(`No pude consultar el estado: ${msg}`);
        timeoutId = setTimeout(tick, INTERVALO_POLLING_MS * 2);
      }
    };
    tick();
    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id, pollTick]);

  if (cargandoInicial || !estado) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando extracción…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>
        {estado.estado === "extraido" || estado.estado === "parcial" ? (
          <a
            href={`/api/extracciones/${estado.id}/excel`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </a>
        ) : null}
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {estado.banco ?? "Extracto"}
          {estado.periodo ? (
            <span className="ml-2 text-muted-foreground">· {estado.periodo}</span>
          ) : null}
        </h1>
        <div className="text-xs text-muted-foreground">
          ID {estado.id}
          {estado.cuenta ? <> · Cuenta {estado.cuenta}</> : null}
          {estado.titular ? <> · {estado.titular}</> : null}
        </div>
      </header>

      {estado.estado === "procesando" ? (
        <BarraProgreso
          chunksOk={estado._meta.chunksOk}
          chunksTotal={estado._meta.chunksTotal}
          paginasTotal={estado._meta.paginasTotal}
        />
      ) : null}

      {estado.estado === "parcial" ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Extracción parcial.</p>
              <p>
                {estado._meta.chunksFallidos.length} de{" "}
                {estado._meta.chunksTotal} bloques no se pudieron procesar.
                Podés reintentarlos.
              </p>
              <ul className="ml-4 list-disc text-xs">
                {estado._meta.chunksFallidos.map((c) => (
                  <li key={c.indice}>
                    Bloque {c.indice + 1} (páginas {c.paginas.join(", ")}):{" "}
                    {c.error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reanudar}
            disabled={reanudando}
            className="shrink-0"
          >
            {reanudando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reanudar
          </Button>
        </div>
      ) : null}

      {estado.estado === "error" ? (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">La extracción falló.</p>
            <p>{estado.error ?? "Error desconocido."}</p>
          </div>
        </div>
      ) : null}

      <div className="text-xs text-muted-foreground">
        {estado._meta.modelo ? <>Modelo {estado._meta.modelo} · </> : null}
        {estado._meta.chunksOk}/{estado._meta.chunksTotal} bloques ·{" "}
        {estado._meta.paginasTotal} páginas ·{" "}
        {estado._meta.tokensInput + estado._meta.tokensOutput} tokens ·{" "}
        {estado._meta.tiempoMs} ms
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Descripción</th>
              <th className="px-3 py-2 text-right font-medium">Débito</th>
              <th className="px-3 py-2 text-right font-medium">Crédito</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {estado.movimientos.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  {estado.estado === "procesando"
                    ? "Los movimientos van a aparecer acá a medida que se procesan los bloques."
                    : "No se encontraron movimientos en el documento."}
                </td>
              </tr>
            ) : (
              estado.movimientos.map((m, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{m.fecha}</td>
                  <td className="px-3 py-2">{m.descripcion}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtImporte(m.debito)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtImporte(m.credito)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtImporte(m.saldo)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarraProgreso({
  chunksOk,
  chunksTotal,
  paginasTotal,
}: {
  chunksOk: number;
  chunksTotal: number;
  paginasTotal: number;
}) {
  const porcentaje =
    chunksTotal > 0 ? Math.min(100, Math.round((chunksOk / chunksTotal) * 100)) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">Procesando extracción…</span>
        </div>
        <span className="tabular-nums text-muted-foreground">
          {chunksOk}/{chunksTotal} bloques · {paginasTotal} páginas
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {porcentaje}% — los movimientos aparecen abajo a medida que se procesan.
      </p>
    </div>
  );
}
