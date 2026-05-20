/**
 * Devuelve un par de clases tailwind (bg + text) determinístico a partir
 * de un slug de entidad. Sirve para pintar el avatar circular con la
 * inicial de la entidad en las cards del Home, sin necesidad de subir
 * logos reales en Fase 3.
 */
const PALETA = [
  { bg: "bg-sky-100 dark:bg-sky-900/40", text: "text-sky-700 dark:text-sky-200" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-200" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-200" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-200" },
  { bg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-200" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-200" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-200" },
  { bg: "bg-lime-100 dark:bg-lime-900/40", text: "text-lime-700 dark:text-lime-200" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-200" },
] as const;

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function paletaDeEntidad(slug: string): {
  bg: string;
  text: string;
} {
  const idx = hashSlug(slug) % PALETA.length;
  return PALETA[idx] ?? PALETA[0]!;
}

export function inicialesDeEntidad(nombre: string): string {
  const partes = nombre
    .replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[1]![0]!).toUpperCase();
}
