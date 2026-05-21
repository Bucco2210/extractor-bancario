import { config as cargarEnv } from "dotenv";
cargarEnv({ path: ".env.local" });
cargarEnv({ path: ".env" });

import mongoose from "mongoose";
import { getEnv } from "../app/lib/env";
import { Extraccion } from "../app/models/Extraccion";
import { Conciliacion } from "../app/models/Conciliacion";
import {
  cifrar,
  esCifrado,
  cifrarMovimiento,
  cifrarRegistroSegundaFuente,
} from "../app/lib/cifrado";

/**
 * Migra los campos sensibles existentes a su versión cifrada.
 *
 * Idempotente: detecta valores ya cifrados (prefijo `enc:v1:`) y los
 * saltea. Se puede correr múltiples veces sin riesgo.
 *
 * Procesa en batches para no cargar todo en memoria. Loguea progreso cada
 * 50 docs por colección.
 *
 * Uso:
 *   npx tsx scripts/migrar-encriptacion.ts
 *   npx tsx scripts/migrar-encriptacion.ts --dry-run
 *
 * IMPORTANTE: hacé un backup de la DB antes de correrlo en producción.
 */

const TAMANO_BATCH = 100;
const LOG_CADA = 50;

type Stats = {
  totalEscaneados: number;
  yaCifrados: number;
  actualizados: number;
  fallidos: number;
};

const dryRun = process.argv.includes("--dry-run");

function nuevasStats(): Stats {
  return { totalEscaneados: 0, yaCifrados: 0, actualizados: 0, fallidos: 0 };
}

function logProgreso(coleccion: string, stats: Stats): void {
  console.log(
    `[${coleccion}] escaneados=${stats.totalEscaneados} ` +
      `cifrados=${stats.actualizados} salteados=${stats.yaCifrados} ` +
      `fallidos=${stats.fallidos}`,
  );
}

async function migrarExtracciones(): Promise<Stats> {
  const stats = nuevasStats();
  const cursor = Extraccion.find({}).batchSize(TAMANO_BATCH).cursor();
  for await (const doc of cursor) {
    stats.totalEscaneados += 1;
    try {
      const update: Record<string, unknown> = {};
      let cambios = 0;

      if (doc.cuenta && !esCifrado(doc.cuenta)) {
        update.cuenta = cifrar(doc.cuenta);
        cambios += 1;
      }
      if (doc.titular && !esCifrado(doc.titular)) {
        update.titular = cifrar(doc.titular);
        cambios += 1;
      }

      const movs = doc.movimientos ?? [];
      const hayMovsAuxCifrar = movs.some(
        (m) =>
          (m.descripcion && !esCifrado(m.descripcion)) ||
          (m.referencia && !esCifrado(m.referencia)),
      );
      if (hayMovsAuxCifrar) {
        update.movimientos = movs.map((m) =>
          cifrarMovimiento({
            fecha: m.fecha,
            descripcion: m.descripcion,
            referencia: m.referencia,
            debito: m.debito,
            credito: m.credito,
            saldo: m.saldo,
          }),
        );
        cambios += 1;
      }

      if (cambios === 0) {
        stats.yaCifrados += 1;
      } else {
        if (!dryRun) {
          await Extraccion.updateOne({ _id: doc._id }, { $set: update });
        }
        stats.actualizados += 1;
      }
    } catch (err) {
      stats.fallidos += 1;
      console.error(`  ✗ falla en extracción ${String(doc._id)}:`, err);
    }
    if (stats.totalEscaneados % LOG_CADA === 0) logProgreso("extracciones", stats);
  }
  logProgreso("extracciones", stats);
  return stats;
}

async function migrarConciliaciones(): Promise<Stats> {
  const stats = nuevasStats();
  const cursor = Conciliacion.find({}).batchSize(TAMANO_BATCH).cursor();
  for await (const doc of cursor) {
    stats.totalEscaneados += 1;
    try {
      const registros = doc.segundaFuente?.registros ?? [];
      const hayRegistrosACifrar = registros.some(
        (r) =>
          (r.descripcion && !esCifrado(r.descripcion)) ||
          (r.referencia && !esCifrado(r.referencia)),
      );
      if (!hayRegistrosACifrar) {
        stats.yaCifrados += 1;
      } else {
        const nuevos = registros.map((r) =>
          cifrarRegistroSegundaFuente({
            idx: r.idx,
            fecha: r.fecha,
            descripcion: r.descripcion,
            monto: r.monto,
            referencia: r.referencia,
          }),
        );
        if (!dryRun) {
          await Conciliacion.updateOne(
            { _id: doc._id },
            { $set: { "segundaFuente.registros": nuevos } },
          );
        }
        stats.actualizados += 1;
      }
    } catch (err) {
      stats.fallidos += 1;
      console.error(`  ✗ falla en conciliación ${String(doc._id)}:`, err);
    }
    if (stats.totalEscaneados % LOG_CADA === 0) logProgreso("conciliaciones", stats);
  }
  logProgreso("conciliaciones", stats);
  return stats;
}

async function main(): Promise<void> {
  const env = getEnv();
  console.log(
    `\n=== Migración de cifrado en reposo ${dryRun ? "(DRY RUN)" : ""} ===`,
  );
  console.log(`Conectando a ${env.MONGODB_DB_NAME}…`);
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });

  const statsExt = await migrarExtracciones();
  const statsConc = await migrarConciliaciones();

  console.log("\n=== Resumen ===");
  console.log("Extracciones:", statsExt);
  console.log("Conciliaciones:", statsConc);
  if (dryRun) {
    console.log(
      "\n(dry-run, no se escribió nada en DB. Re-corré sin --dry-run para aplicar.)",
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n✗ Migración falló:", err);
  process.exit(1);
});
