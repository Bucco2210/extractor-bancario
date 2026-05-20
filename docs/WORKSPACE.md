# Workspace — pestañas tipo navegador

> Estado: Fase 4. Documenta el flujo del workspace (`/workspace`), el
> store de Zustand, la sincronización con Mongo y los atajos de
> teclado.

## Concepto

El **workspace** es el espacio donde el usuario tiene varios extractos
abiertos al mismo tiempo, como pestañas de navegador. La Home (`/`) es
el punto de entrada para iniciar nuevas extracciones; el workspace es
donde se las consulta, edita y exporta.

Cada **pestaña** representa una extracción (`Extraccion._id`) y muestra
su estado en vivo (polling). Cambiar de pestaña no recarga la página
— se reusa la vista `VistaEstadoExtraccion` con un `key={extraccionId}`
para reiniciar el polling de cada extracción.

## Store (`app/stores/workspace.ts`)

Zustand con middleware `persist` (localStorage) + sincronización a
Mongo via `useWorkspaceSync`.

```ts
type PestanaWorkspace = {
  id: string;               // uuid local
  extraccionId: string;     // referencia a Extraccion._id
  titulo: string;           // "Banco Galicia · 10/2025"
  perfilId: string | null;
};

type WorkspaceState = {
  pestanas: PestanaWorkspace[];
  activeId: string | null;
  hidratada: boolean;       // false hasta primer sync con Mongo
};
```

Acciones:

| Acción | Comportamiento |
|---|---|
| `abrir({ extraccionId, titulo, perfilId? })` | Si ya existe una pestaña con ese `extraccionId`, la reactiva. Si no, crea una nueva. Devuelve `null` si se supera el límite. |
| `cerrar(id)` | Elimina la pestaña. Si era la activa, auto-activa la pestaña a la derecha (o a la izquierda si era la última). |
| `cerrarTodas()` | Limpia todo. |
| `activar(id)` | Hace activa la pestaña indicada. |
| `renombrar(id, titulo)` | Cambia el título de una pestaña. |
| `setPerfilId(id, perfilId)` | Actualiza el `perfilId` asociado. |

### Storage

- **localStorage** (`partialize` excluye `hidratada`): persiste por
  máquina, sobrevive a refresh.
- **Mongo** (`usuarios.preferencias.pestanasAbiertas`): sincronización
  cross-device via `useWorkspaceSync`. Se desactiva con
  `PERSISTIR_PESTANAS_EN_MONGO=false`.
- **Storage fallback en memoria** para SSR y tests, así el middleware
  `persist` no explota cuando `window` no existe.

### Límite

`MAX_PESTANAS_ABIERTAS` (env, default 15). Cuando el usuario intenta
abrir una pestaña más allá del límite, `abrir` devuelve `null` y el
caller muestra un toast `"Llegaste al límite de pestañas abiertas..."`.
**No cerramos pestañas automáticamente** (decisión explícita: sorpren-
der al usuario cerrando algo abierto es peor que pedir que cierre
manualmente).

## Sincronización con Mongo (`useWorkspaceSync`)

Hook que se monta una sola vez (en `Workspace.tsx`):

1. **Hidratación inicial** — `GET /api/usuarios/pestanas`. Si el local
   está vacío y Mongo tiene pestañas, las traemos. Si el local ya tiene
   pestañas, "esta máquina manda" y el próximo PUT escribirá local.
2. **Persistencia** — Cada cambio del store dispara un `PUT /api/usuarios/pestanas`
   con debounce 500 ms. Compara firma JSON para no escribir sin
   cambios reales.
3. **Falla silenciosa** — Si el PUT falla, localStorage ya guardó. El
   próximo cambio reintenta.

El handler PUT recorta el array al `MAX_PESTANAS_ABIERTAS` del server
(idempotencia ante clientes con un límite local mayor) y normaliza
para que como máximo una pestaña tenga `activa: true`.

## UI

```
┌──────────────────────────────────────────────┐
│ B&B Tech                       [Seba] [salir]│
├──────────────────────────────────────────────┤
│ [Galicia · 10/25] [BBVA · 09/25] ...    [+] │ ← WorkspaceBar
├──────────────────────────────────────────────┤
│ Perfil: [Banco Galicia · Extracto · ARS ▾]   │ ← SelectorPerfil
├──────────────────────────────────────────────┤
│                                              │
│      VistaEstadoExtraccion (reusada)         │
│                                              │
└──────────────────────────────────────────────┘
```

- **WorkspaceBar** — pestañas + botón `+` que redirige a `/` (la Home
  ya tiene todos los caminos para iniciar una extracción).
- **SelectorPerfil** — `Select` con todos los perfiles activos. Al
  cambiar, hace `PATCH /api/extracciones/<id> { perfilId }` y actualiza
  el store.
- **VistaEstadoExtraccion** — el mismo componente que vive en
  `/extracciones/[id]`. Se monta con `key={extraccionId}` para que
  el polling se reinicie por pestaña.
- **WorkspaceVacio** — empty state cuando no hay pestañas: invita a
  ir a la Home.

## Integración Home → workspace

- **Dropzone rápido**: tras `POST /api/extracciones`, en vez de
  redirigir a `/extracciones/<id>`, abre la pestaña en el store y
  navega a `/workspace`. El título usa la entidad detectada
  (cuando hubo auto-detección).
- **Panel de Producto**: idem — el `perfilId` viene fijado y se pasa
  al store.
- **Modal de detección dudosa**: ya sea que el usuario elija un
  candidato o salte el paso, abre pestaña + navega a `/workspace`.
- **Carrusel "Últimos extractos"**: los items ya no son `<Link>` sino
  `<button>` que abren pestaña.
- **Banner**: si hay pestañas abiertas, la Home muestra
  *"Tenés N extractos abiertos en el workspace [→ ir]"*.

## Atajos de teclado

Implementado en `AtajosTecladoWorkspace` (montado dentro de `Workspace.tsx`).

| Atajo | Acción |
|---|---|
| `Cmd/Ctrl + W` | Cerrar pestaña activa |
| `Cmd/Ctrl + Shift + W` | Cerrar todas las pestañas |
| `Cmd/Ctrl + 1` .. `9` | Activar la pestaña en esa posición |

`Cmd/Ctrl + T` y `Cmd/Ctrl + Tab` quedan reservados para el navegador.

## Rutas relacionadas

| Método | Ruta | Notas |
|---|---|---|
| `GET` | `/workspace?abrir=<extraccionId>` | Abre la pestaña indicada y limpia el query |
| `GET` | `/api/usuarios/pestanas` | Lee `usuarios.preferencias.pestanasAbiertas` |
| `PUT` | `/api/usuarios/pestanas` | Persiste `{ pestanas: [...] }`. Recorta al `MAX_PESTANAS_ABIERTAS`. |

## `/extracciones/[id]` standalone

La ruta `/extracciones/[id]` sigue accesible (bookmarks, links
externos). En Fase 4 no la redirigimos automáticamente al workspace —
es una vista de detalle estática complementaria. La diferencia con
el workspace es que no tiene barra de pestañas ni selector de perfil
arriba.

## Decisiones explícitas

- **Split view se posterga a Fase 6** (conciliación). En Fase 4 cada
  pestaña es single-view.
- **Reordenar pestañas con drag se posterga a Fase 8** (pulido).
- **Una sola pestaña por extracción**: si el usuario hace click en un
  extracto que ya tiene pestaña, reactivamos en vez de duplicar.
- **El botón `+` redirige a `/`** en vez de abrir un modal, para no
  duplicar la lógica del DropzoneRapido.
