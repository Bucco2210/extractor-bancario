/**
 * Lógica pura del modo oscuro/claro.
 *
 * El estado vive en localStorage bajo `STORAGE_KEY` con tres valores
 * posibles: `"light"` (claro forzado), `"dark"` (oscuro forzado) o
 * ausente (= seguir `prefers-color-scheme`).
 *
 * El componente `ToggleTema` y el script anti-flash en `RootLayout`
 * usan los mismos helpers para no divergir.
 */

export type Tema = "light" | "dark";
export type PreferenciaTema = Tema | "system";

export const STORAGE_KEY = "bb-tema";

/**
 * Resuelve qué tema aplicar dado:
 *  - lo guardado en localStorage (puede ser null)
 *  - lo que pide el SO (`prefers-color-scheme: dark`)
 *
 * Función pura — los tests le pasan los dos valores sin tocar el DOM.
 */
export function resolverTema(
  guardado: string | null,
  systemPrefiereOscuro: boolean,
): Tema {
  if (guardado === "dark") return "dark";
  if (guardado === "light") return "light";
  return systemPrefiereOscuro ? "dark" : "light";
}

/**
 * Devuelve la preferencia "tal cual la pidió el usuario": `system` si
 * no hay nada guardado. La UI del toggle muestra los 3 estados.
 */
export function leerPreferencia(guardado: string | null): PreferenciaTema {
  if (guardado === "dark" || guardado === "light") return guardado;
  return "system";
}

/**
 * Aplica la clase `.dark` al `<html>` según el tema dado. Idempotente.
 * No-op en SSR (no hay `document`).
 */
export function aplicarTemaAlDom(tema: Tema): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (tema === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
}

/**
 * Script inline que se ejecuta antes del primer render para evitar el
 * "flash" de tema claro mientras hidrata. Lo serializamos como string
 * para inyectarlo en `<script dangerouslySetInnerHTML>`.
 *
 * Lee localStorage y matchMedia, decide el tema, y aplica la clase.
 */
export const SCRIPT_ANTI_FLASH = `
(function(){try{
  var g = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  var s = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var t = (g === 'dark') ? 'dark' : (g === 'light') ? 'light' : (s ? 'dark' : 'light');
  if (t === 'dark') document.documentElement.classList.add('dark');
}catch(_){}})();
`.trim();
