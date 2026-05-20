"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  FileText,
  Download,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Movimiento = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  debito: number | null;
  credito: number | null;
  saldo: number | null;
};

type ChunkFallido = {
  indice: number;
  paginas: number[];
  error: string;
};

type EstadoExtraccion = "pendiente" | "procesando" | "extraido" | "parcial" | "error";

type EstadoServidor = {
  id: string;
  estado: EstadoExtraccion;
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

type RespuestaInicio = {
  id: string;
  estado: "procesando";
  paginasTotal: number;
  chunksTotal: number;
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

export function UploadExtracto() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [banco, setBanco] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<EstadoServidor | null>(null);
  const [extraccionId, setExtraccionId] = useState<string | null>(null);
  const [reanudando, setReanudando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [pollTick, setPollTick] = useState(0);

  const reset = useCallback(() => {
    setEstado(null);
    setExtraccionId(null);
    setPollTick(0);
  }, []);

  function elegirArchivo(file: File | null) {
    reset();
    setArchivo(file);
  }

  useEffect(() => {
    if (!extraccionId) return;

    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelado) return;
      try {
        const res = await fetch(`/api/extracciones/${extraccionId}`, {
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
  }, [extraccionId, pollTick]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!archivo) {
      toast.error("Elegí un PDF primero.");
      return;
    }
    setEnviando(true);
    reset();
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      if (banco.trim()) fd.append("banco", banco.trim());
      const res = await fetch("/api/extracciones", { method: "POST", body: fd });
      const json = (await res.json()) as
        | RespuestaInicio
        | { error: string; mensaje: string };
      if (!res.ok) {
        const msg = "mensaje" in json ? json.mensaje : "Error al iniciar la extracción.";
        toast.error(msg);
        return;
      }
      const ok = json as RespuestaInicio;
      setExtraccionId(ok.id);
      setEstado({
        id: ok.id,
        estado: "procesando",
        cuenta: null,
        periodo: null,
        titular: null,
        error: null,
        movimientos: [],
        _meta: {
          modelo: "",
          tokensInput: 0,
          tokensOutput: 0,
          tiempoMs: 0,
          paginasTotal: ok.paginasTotal,
          chunksTotal: ok.chunksTotal,
          chunksOk: 0,
          chunksFallidos: [],
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  async function reanudar() {
    if (!extraccionId) return;
    setReanudando(true);
    try {
      const res = await fetch(`/api/extracciones/${extraccionId}/reanudar`, {
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
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) elegirArchivo(file);
  }

  const procesando = enviando || estado?.estado === "procesando";

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
            arrastrando
              ? "border-primary bg-muted"
              : "border-muted-foreground/30 hover:border-primary/60"
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            Arrastrá un PDF acá o hacé click para elegir
          </p>
          {archivo ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" />
              {archivo.name} · {(archivo.size / 1024).toFixed(1)} KB
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Solo PDFs digitales. Para escaneados se necesita OCR (fase posterior).
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="banco">Banco / entidad (opcional)</Label>
          <Input
            id="banco"
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            placeholder="ej: Galicia, Mercado Pago, Santander…"
          />
          <p className="text-xs text-muted-foreground">
            En Fase 3 se reemplaza por la selección visual de banco + producto.
          </p>
        </div>

        <Button type="submit" disabled={procesando || !archivo} className="self-start">
          {procesando ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {enviando ? "Subiendo…" : "Extrayendo…"}
            </>
          ) : (
            "Extraer movimientos"
          )}
        </Button>
      </form>

      {estado ? (
        <ResultadoExtraccion
          data={estado}
          onReanudar={reanudar}
          reanudando={reanudando}
        />
      ) : null}
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
  const porcentaje = chunksTotal > 0
    ? Math.min(100, Math.round((chunksOk / chunksTotal) * 100))
    : 0;
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

function ResultadoExtraccion({
  data,
  onReanudar,
  reanudando,
}: {
  data: EstadoServidor;
  onReanudar: () => void;
  reanudando: boolean;
}) {
  const procesando = data.estado === "procesando";
  const enError = data.estado === "error";

  return (
    <div className="flex flex-col gap-4 border-t pt-6">
      {procesando ? (
        <BarraProgreso
          chunksOk={data._meta.chunksOk}
          chunksTotal={data._meta.chunksTotal}
          paginasTotal={data._meta.paginasTotal}
        />
      ) : null}

      {data.estado === "parcial" ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Extracción parcial.</p>
              <p>
                {data._meta.chunksFallidos.length} de {data._meta.chunksTotal}{" "}
                bloques no se pudieron procesar. Podés reintentarlos con
                &quot;Reanudar extracción&quot;.
              </p>
              <ul className="ml-4 list-disc text-xs">
                {data._meta.chunksFallidos.map((c) => (
                  <li key={c.indice}>
                    Bloque {c.indice + 1} (páginas {c.paginas.join(", ")}): {c.error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReanudar}
            disabled={reanudando}
            className="shrink-0"
          >
            {reanudando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reanudar extracción
          </Button>
        </div>
      ) : null}

      {enError ? (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">La extracción falló.</p>
            <p>{data.error ?? "Error desconocido."}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1 text-sm">
          {data.cuenta ? (
            <div>
              <span className="text-muted-foreground">Cuenta: </span>
              <span className="font-medium">{data.cuenta}</span>
            </div>
          ) : null}
          {data.periodo ? (
            <div>
              <span className="text-muted-foreground">Período: </span>
              <span className="font-medium">{data.periodo}</span>
            </div>
          ) : null}
          {data.titular ? (
            <div>
              <span className="text-muted-foreground">Titular: </span>
              <span className="font-medium">{data.titular}</span>
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {data._meta.modelo ? <>Modelo {data._meta.modelo} · </> : null}
            {data._meta.chunksOk}/{data._meta.chunksTotal} bloques ·{" "}
            {data._meta.paginasTotal} páginas ·{" "}
            {data._meta.tokensInput + data._meta.tokensOutput} tokens ·{" "}
            {data._meta.tiempoMs} ms
          </div>
        </div>
        {data.estado === "extraido" || data.estado === "parcial" ? (
          <a
            href={`/api/extracciones/${data.id}/excel`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </a>
        ) : null}
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
            {data.movimientos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  {procesando
                    ? "Los movimientos van a aparecer acá a medida que se procesan los bloques."
                    : "No se encontraron movimientos en el documento."}
                </td>
              </tr>
            ) : (
              data.movimientos.map((m, i) => (
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
