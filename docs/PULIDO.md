# Pulido — modo oscuro, KPIs del usuario, banner de ciclo

Cierre de **Fase 8**. Tres mejoras de UX que se montan sobre lo que
ya estaba construido en las fases anteriores.

## Modo oscuro

El sistema de temas estaba parcialmente armado desde Fase 1: variables
CSS oklch para `.dark` en `app/globals.css`, modificadores `dark:` en
componentes shadcn. Faltaba el toggle y la persistencia.

### Helper puro (`app/lib/tema.ts`)

```ts
type Tema = "light" | "dark";
type PreferenciaTema = Tema | "system";

resolverTema(guardado, systemPrefiereOscuro) → Tema
leerPreferencia(guardado) → PreferenciaTema
aplicarTemaAlDom(tema)                       // no-op en SSR
SCRIPT_ANTI_FLASH                            // string para <script>
```

- `STORAGE_KEY = "bb-tema"` en localStorage. Valores: `"light"`,
  `"dark"`, o ausente (= `"system"`).
- `resolverTema()` es pura — los tests le pasan los dos inputs sin
  tocar el DOM.
- `SCRIPT_ANTI_FLASH` se inyecta como `<script dangerouslySetInnerHTML>`
  dentro del `<head>` del `RootLayout`. Lee localStorage + matchMedia
  + aplica `.dark` antes del primer paint. Solo agrega clase, nunca
  quita — el server siempre renderiza sin `.dark`.

### Toggle (`app/components/ui/ToggleTema.tsx`)

- Botón cíclico: `system → light → dark → system`.
- Iconos: `Monitor` / `Sun` / `Moon` (lucide).
- Usa `useSyncExternalStore` para suscribirse a localStorage +
  `prefers-color-scheme` change. Cumple `react-hooks/set-state-in-effect`.
- Cuando la preferencia es "system" y el SO cambia (claro ↔ oscuro),
  re-aplica la clase automáticamente.
- Al cambiar de tema dispara un `StorageEvent` manual para que otros
  tabs abiertos se sincronicen (el evento `storage` nativo solo cruza
  tabs, no aplica al mismo tab).

### Integración

- `app/layout.tsx`: `<script>` con `SCRIPT_ANTI_FLASH` + `suppressHydrationWarning`
  en `<html>`.
- `app/(ui)/layout.tsx`: `<ToggleTema />` siempre visible en el header,
  también para sesiones no autenticadas (login, registro).

### Tests (`tests/tema.test.ts`)

9 tests: `resolverTema` con todas las combinaciones, `leerPreferencia`,
y garantías del script (clave correcta, solo `.add` nunca `.remove`,
try/catch).

---

## KPIs personales (`/cuenta`)

`/cuenta` ya mostraba plan + ciclo + barras de uso desde Fase 9. En
Fase 8 se sumó la sección **"Tu actividad"** con 4 cards.

### Helper (`app/lib/kpis-usuario.ts`)

```ts
calcularKpisUsuario({ usuarioId, cicloInicio, cicloFin }): Promise<{
  extraccionesEnCiclo: number;
  conciliacionesEnCiclo: number;
  tokensEnCiclo: number;          // sum(_meta.tokensInput + tokensOutput)
  porEstado: Record<string, number>;
  extraccionesTotales: number;    // histórico
  conciliacionesTotales: number;  // histórico
}>
```

- Filtra todo por `usuarioId` — distinto al admin que ve global.
- Recibe la ventana del ciclo ya resuelta para alinearse con lo que
  cuenta el `plan-gate` (no decide la ventana por sí mismo).
- Sin ventana (`cicloInicio = null`), no filtra por `createdAt`.

### UI

`/cuenta` ahora muestra:

```
┌─ Plan Pro · Ciclo mensual del 01/05 al 31/05  [Activa] ─┐
│  ▓▓▓▓▓▓▓▓░░░░ 12 / 75 extracciones                       │
│  ░░░░░░░░░░░░  3 / 10 conciliaciones                     │
└──────────────────────────────────────────────────────────┘

┌─ Tu actividad ──────────────────────────────────────────┐
│  📄 Extracciones del ciclo: 12  (50 en total histórico)  │
│  🧾 Conciliaciones: 3  (20 en total histórico)           │
│  ⚡ Tokens OpenAI: 18.450                                 │
│  ✅ Estado: 10 ok · 2 en proceso · 0 con error           │
└──────────────────────────────────────────────────────────┘
```

Sin gráficos para esta fase — solo cards tabulares + barras CSS,
alineado al estilo del panel admin.

### Tests (`tests/kpis-usuario.test.ts`)

5 tests: agrega countDocuments + aggregates, filtra por ventana,
sin ventana no filtra por createdAt, tokens=0 sin extracciones,
ignora `_id` nulo en el breakdown de estado.

---

## Banner de ciclo (Home)

Server component `app/components/home/BannerCicloUsuario.tsx` que se
renderiza arriba de `<Home />` en `app/(ui)/page.tsx`.

Reglas de visibilidad (se renderiza `null` cuando no aplica):

- Sin sesión (defensivo — el proxy ya redirige).
- Admin sin `planInfo` (admins no tienen gate).
- Uso bajo y estado activo: nada urgente que comunicar.

Cuando sí aparece:

- **Uso >= 80%** del límite → fondo ámbar suave.
- **`estadoCuenta != "activa"`** → fondo ámbar + texto extra
  "Modo lectura — renová para seguir extrayendo".
- **Uso normal pero > 0** → fondo celeste suave con resumen.

Link a `/cuenta` para ver detalle. Compatible con modo oscuro vía
los `dark:` modifiers correspondientes.

---

## Decisión vigente

Por ahora **no** sumamos librerías de gráficos (Recharts / Chart.js).
Las barras CSS + tabular son suficientes para el dataset actual. Si
el usuario pide tendencias temporales, se evalúa en una fase futura.
