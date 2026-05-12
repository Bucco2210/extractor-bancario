"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Download } from "lucide-react";
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

type ResultadoExtraccion = {
  id: string;
  cuenta: string | null;
  periodo: string | null;
  titular: string | null;
  movimientos: Movimiento[];
  _meta: {
    modelo: string;
    tokensInput: number;
    tokensOutput: number;
    tiempoMs: number;
  };
};

const formatoMonedaArs = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtImporte(v: number | null): string {
  if (v === null || v === undefined) return "";
  return formatoMonedaArs.format(v);
}

export function UploadExtracto() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [banco, setBanco] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoExtraccion | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function elegirArchivo(file: File | null) {
    setResultado(null);
    setArchivo(file);
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!archivo) {
      toast.error("Elegí un PDF primero.");
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      if (banco.trim()) fd.append("banco", banco.trim());
      const res = await fetch("/api/extracciones", { method: "POST", body: fd });
      const json = (await res.json()) as
        | ResultadoExtraccion
        | { error: string; mensaje: string };
      if (!res.ok) {
        const msg = "mensaje" in json ? json.mensaje : "Error en la extracción.";
        toast.error(msg);
        return;
      }
      const ok = json as ResultadoExtraccion;
      setResultado(ok);
      toast.success(`Se extrajeron ${ok.movimientos.length} movimientos.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) elegirArchivo(file);
  }

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

        <Button type="submit" disabled={enviando || !archivo} className="self-start">
          {enviando ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extrayendo…
            </>
          ) : (
            "Extraer movimientos"
          )}
        </Button>
      </form>

      {resultado ? <ResultadoTabla data={resultado} /> : null}
    </div>
  );
}

function ResultadoTabla({ data }: { data: ResultadoExtraccion }) {
  return (
    <div className="flex flex-col gap-4 border-t pt-6">
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
            Modelo {data._meta.modelo} · {data._meta.tokensInput +
              data._meta.tokensOutput}{" "}
            tokens · {data._meta.tiempoMs} ms
          </div>
        </div>
        <a
          href={`/api/extracciones/${data.id}/excel`}
          className={buttonVariants({ variant: "outline" })}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar Excel
        </a>
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
                  No se encontraron movimientos en el documento.
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
