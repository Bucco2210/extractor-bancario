"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

const FRASES_INICIO = [
  "Leyendo las páginas del PDF…",
  "Detectando el banco emisor del extracto…",
  "Calculando la huella del documento para futuras extracciones…",
  "Si ya vimos este formato antes, lo resolvemos sin IA.",
];

const FRASES_PROCESO = [
  "Analizando movimientos con IA…",
  "Procesando bloque {chunksOk} de {chunksTotal}…",
  "Para extractos largos dividimos el PDF y procesamos en paralelo.",
  "Validando fechas y normalizando importes…",
  "Reconociendo cuentas y períodos en el encabezado…",
  "Si algún bloque falla, el sistema te deja reanudar después.",
];

const FRASES_FINAL = [
  "Casi listo, ordenando los movimientos…",
  "Cruzando saldos del cierre…",
  "Cerrando la extracción y guardando todo…",
];

const INTERVALO_MS = 3000;
const TICK_ANIMACION_MS = 250;
const SEGUNDOS_POR_CHUNK_DEFAULT = 20;
const TOPE_PSEUDO_DENTRO_DE_CHUNK = 0.92;
const TOPE_GLOBAL_VISIBLE = 95;

export function BarraProgresoLudica({
  chunksOk,
  chunksTotal,
  paginasTotal,
}: {
  chunksOk: number;
  chunksTotal: number;
  paginasTotal: number;
}) {
  const porcentajeReal =
    chunksTotal > 0 ? Math.min(100, Math.round((chunksOk / chunksTotal) * 100)) : 0;

  // Pseudo-progreso animado: el bar nunca se "queda en 0". Mientras el chunk
  // en curso se procesa, interpolamos suavemente hacia el próximo milestone
  // real usando el tiempo promedio observado por chunk. Cuando el backend
  // reporta un chunk nuevo, el bar encaja en el valor real y vuelve a animar.
  const [porcentajeAnimado, setPorcentajeAnimado] = useState(porcentajeReal);

  useEffect(() => {
    const tMontaje = Date.now();
    let tInicioChunk = Date.now();
    let ultimoChunksOk = chunksOk;

    const id = setInterval(() => {
      if (chunksTotal <= 0) {
        setPorcentajeAnimado(porcentajeReal);
        return;
      }
      if (chunksOk !== ultimoChunksOk) {
        ultimoChunksOk = chunksOk;
        tInicioChunk = Date.now();
      }
      const segPromedio =
        chunksOk > 0
          ? Math.max(5, (Date.now() - tMontaje) / 1000 / chunksOk)
          : SEGUNDOS_POR_CHUNK_DEFAULT;
      const elapsedChunkSeg = (Date.now() - tInicioChunk) / 1000;
      const pseudoDentroDeChunk = Math.min(
        TOPE_PSEUDO_DENTRO_DE_CHUNK,
        elapsedChunkSeg / segPromedio,
      );
      const fraccion = (chunksOk + pseudoDentroDeChunk) / chunksTotal;
      const calc = Math.round(fraccion * 100);
      const next = Math.min(
        TOPE_GLOBAL_VISIBLE,
        Math.max(porcentajeReal, calc),
      );
      setPorcentajeAnimado((prev) => (prev === next ? prev : next));
    }, TICK_ANIMACION_MS);
    return () => clearInterval(id);
  }, [chunksOk, chunksTotal, porcentajeReal]);

  const porcentaje = Math.max(porcentajeAnimado, porcentajeReal);

  // Fase de frases según avance. Indeterminado al principio (sin chunks
  // hechos), proceso intermedio, cierre cuando estamos cerca del fin.
  const fase = useMemo<string[]>(() => {
    if (chunksOk === 0 && porcentaje < 10) return FRASES_INICIO;
    if (porcentaje >= 80) return FRASES_FINAL;
    return FRASES_PROCESO;
  }, [chunksOk, porcentaje]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  const fraseBase = fase[tick % fase.length] ?? fase[0]!;
  const frase = fraseBase
    .replaceAll("{chunksOk}", String(chunksOk))
    .replaceAll("{chunksTotal}", String(chunksTotal))
    .replaceAll("{paginasTotal}", String(paginasTotal));

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-gradient-to-br from-sky-50 via-white to-sky-100 p-5 shadow-sm dark:from-sky-950/40 dark:via-background dark:to-sky-900/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p
              key={`${fase.length}-${tick}`}
              className="text-sm font-medium leading-tight animate-in fade-in slide-in-from-bottom-1 duration-500"
            >
              {frase}
            </p>
            <p className="text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline-block h-3 w-3" />
              Esto puede tardar entre 30 segundos y dos minutos según el largo
              del extracto.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold tabular-nums text-sky-700 dark:text-sky-300">
            {porcentaje}%
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {chunksOk}/{chunksTotal} bloques · {paginasTotal} pág.
          </div>
        </div>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sky-200/60 dark:bg-sky-900/50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-600 transition-all duration-500"
          style={{ width: `${Math.max(porcentaje, 4)}%` }}
        />
      </div>
    </div>
  );
}
