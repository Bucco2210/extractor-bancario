import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { procesarExtraccionFn } from "@/lib/inngest-funciones/procesar-extraccion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Endpoint Inngest. En dev lo descubre el binario `inngest-cli dev`
 * automáticamente. En prod hay que registrarlo en Inngest Cloud.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [procesarExtraccionFn],
});
