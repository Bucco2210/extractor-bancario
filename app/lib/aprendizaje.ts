import type { Types } from "mongoose";
import { FormatoAprendido } from "@/models/FormatoAprendido";

/**
 * Crea (o recupera) el FormatoAprendido para esta huella + perfil.
 * Si recién se crea queda en blanco (sin regla, reglaActiva=false): el
 * admin después puede escribirle un regex desde /formatos. Si ya existía,
 * incrementa stats.extraccionesIA (es el caso típico: el pipeline cayó
 * en OpenAI porque no había regla activa o falló).
 */
export async function registrarFormatoTrasIA(input: {
  huella: string;
  resumenHuella: string;
  perfilId: Types.ObjectId | null;
}): Promise<Types.ObjectId | null> {
  if (!input.perfilId) return null;
  const now = new Date();
  const doc = await FormatoAprendido.findOneAndUpdate(
    { huella: input.huella },
    {
      $setOnInsert: {
        huella: input.huella,
        resumenHuella: input.resumenHuella,
        perfilId: input.perfilId,
        reglaRegex: null,
        reglaActiva: false,
        notas: "",
        activo: true,
        "stats.primerUso": now,
      },
      $set: { "stats.ultimoUso": now },
      $inc: { "stats.extraccionesIA": 1 },
    },
    { upsert: true, new: true },
  )
    .select({ _id: 1 })
    .lean();
  return doc?._id ?? null;
}

/**
 * Incrementa el contador correspondiente cuando una regla determinística
 * cubrió completa una extracción (sin necesidad de OpenAI).
 */
export async function registrarExtraccionPorRegla(
  formatoId: Types.ObjectId | string,
): Promise<void> {
  const now = new Date();
  await FormatoAprendido.updateOne(
    { _id: formatoId },
    {
      $set: { "stats.ultimoUso": now },
      $inc: { "stats.extraccionesOk": 1 },
    },
  );
}

/**
 * Marca que una regla falló (matchRate < umbral o error de regex) para
 * que el admin pueda ver el contador en `/formatos` y revisar.
 */
export async function registrarFalloRegla(
  formatoId: Types.ObjectId | string,
): Promise<void> {
  await FormatoAprendido.updateOne(
    { _id: formatoId },
    { $inc: { "stats.extraccionesFallidas": 1 } },
  );
}
