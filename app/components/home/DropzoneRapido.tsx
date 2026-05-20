"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, FileText } from "lucide-react";
import type { RespuestaInicioExtraccion } from "@/lib/home-tipos";

export function DropzoneRapido({
  onIniciar,
  perfilId,
  textoAyuda,
  mostrandoEnPanel = false,
}: {
  /**
   * Se invoca con la respuesta del POST a /api/extracciones. El caller
   * decide qué hacer (redirect, modal de detección dudosa, etc.).
   */
  onIniciar: (
    archivo: File,
    res: RespuestaInicioExtraccion,
  ) => void | Promise<void>;
  /**
   * Si viene fijado (cuando se sube desde un Panel de Producto), se manda
   * al backend para saltear el detector y asignar perfil directo.
   */
  perfilId?: string;
  textoAyuda?: string;
  mostrandoEnPanel?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function subir(file: File): Promise<void> {
    setEnviando(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      if (perfilId) fd.append("perfilId", perfilId);
      const res = await fetch("/api/extracciones", { method: "POST", body: fd });
      const json = (await res.json()) as
        | RespuestaInicioExtraccion
        | { error: string; mensaje: string };
      if (!res.ok) {
        const msg = "mensaje" in json ? json.mensaje : "Error al subir.";
        setErrorMsg(msg);
        return;
      }
      await onIniciar(file, json as RespuestaInicioExtraccion);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setErrorMsg(msg);
    } finally {
      setEnviando(false);
    }
  }

  function manejarArchivo(file: File | null | undefined) {
    if (!file) return;
    void subir(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (enviando) return;
    manejarArchivo(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!enviando) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        onClick={() => !enviando && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors ${
          mostrandoEnPanel ? "p-6" : "p-10"
        } ${
          enviando
            ? "cursor-not-allowed opacity-70"
            : arrastrando
              ? "border-primary bg-muted"
              : "border-muted-foreground/30 hover:border-primary/60"
        }`}
      >
        {enviando ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {enviando
            ? "Subiendo…"
            : mostrandoEnPanel
              ? "Arrastrá el extracto acá o hacé click"
              : "Arrastrá un PDF acá o hacé click para elegir"}
        </p>
        {!enviando ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            {textoAyuda ??
              "El sistema detecta el banco automáticamente. PDFs digitales, hasta 25 MB."}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={enviando}
          onChange={(e) => manejarArchivo(e.target.files?.[0])}
        />
      </div>
      {errorMsg ? (
        <p className="text-xs text-destructive">{errorMsg}</p>
      ) : null}
    </div>
  );
}
