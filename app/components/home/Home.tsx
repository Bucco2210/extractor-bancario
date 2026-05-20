"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import { DropzoneRapido } from "./DropzoneRapido";
import { TabsCategoriaEntidad } from "./TabsCategoriaEntidad";
import { GridBancos } from "./GridBancos";
import { PanelProducto } from "./PanelProducto";
import { CarruselUltimosExtractos } from "./CarruselUltimosExtractos";
import { ModalDeteccionDudosa } from "./ModalDeteccionDudosa";
import { bancosVisibles, perfilesVisibles } from "@/lib/home-tipos";
import { useWorkspaceStore } from "@/stores/workspace";
import type {
  Banco,
  CategoriaTab,
  CoincidenciaDeteccion,
  HomeResumen,
  Perfil,
  RespuestaInicioExtraccion,
} from "@/lib/home-tipos";

type DeteccionPendiente = {
  extraccionId: string;
  candidatos: CoincidenciaDeteccion[];
};

export function Home() {
  const router = useRouter();
  const [resumen, setResumen] = useState<HomeResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<CategoriaTab>("banco");
  const [bancoAbierto, setBancoAbierto] = useState<Banco | null>(null);
  const [deteccionDudosa, setDeteccionDudosa] =
    useState<DeteccionPendiente | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/home/resumen", { cache: "no-store" });
        if (cancelado) return;
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { mensaje?: string }
            | null;
          throw new Error(json?.mensaje ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as HomeResumen;
        if (cancelado) return;
        setResumen(data);
      } catch (err) {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : "Error desconocido";
        toast.error(`No pude cargar el resumen: ${msg}`);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const bancosFiltrados = useMemo(() => {
    if (!resumen) return [];
    const base = bancosVisibles(resumen.bancos, tab);
    return base.map((b) => ({
      ...b,
      perfiles: perfilesVisibles(b, tab),
    }));
  }, [resumen, tab]);

  const conteos = useMemo<Record<CategoriaTab, number>>(() => {
    if (!resumen) return { banco: 0, billetera: 0, tarjeta: 0, favoritos: 0 };
    return {
      banco: bancosVisibles(resumen.bancos, "banco").length,
      billetera: bancosVisibles(resumen.bancos, "billetera").length,
      tarjeta: bancosVisibles(resumen.bancos, "tarjeta").length,
      favoritos: bancosVisibles(resumen.bancos, "favoritos").length,
    };
  }, [resumen]);

  const toggleFavorito = useCallback(
    async (banco: Banco) => {
      const slug = banco.entidad.slug;
      const yaEra = banco.esFavorito;
      // Optimista
      setResumen((prev) =>
        prev
          ? {
              ...prev,
              bancos: prev.bancos.map((b) =>
                b.entidad.slug === slug ? { ...b, esFavorito: !yaEra } : b,
              ),
              favoritos: yaEra
                ? prev.favoritos.filter((s) => s !== slug)
                : [...prev.favoritos, slug],
            }
          : prev,
      );
      setBancoAbierto((b) =>
        b && b.entidad.slug === slug ? { ...b, esFavorito: !yaEra } : b,
      );
      try {
        const res = yaEra
          ? await fetch(
              `/api/usuarios/favoritos?entidadSlug=${encodeURIComponent(slug)}`,
              { method: "DELETE" },
            )
          : await fetch("/api/usuarios/favoritos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entidadSlug: slug }),
            });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { mensaje?: string }
            | null;
          throw new Error(json?.mensaje ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        // Revertir
        setResumen((prev) =>
          prev
            ? {
                ...prev,
                bancos: prev.bancos.map((b) =>
                  b.entidad.slug === slug ? { ...b, esFavorito: yaEra } : b,
                ),
                favoritos: yaEra
                  ? [...prev.favoritos, slug]
                  : prev.favoritos.filter((s) => s !== slug),
              }
            : prev,
        );
        setBancoAbierto((b) =>
          b && b.entidad.slug === slug ? { ...b, esFavorito: yaEra } : b,
        );
        const msg = err instanceof Error ? err.message : "Error desconocido";
        toast.error(`No pude actualizar favoritos: ${msg}`);
      }
    },
    [],
  );

  const abrirEnWorkspace = useCallback(
    (input: {
      extraccionId: string;
      titulo: string;
      perfilId?: string | null;
    }) => {
      const id = useWorkspaceStore.getState().abrir(input);
      if (id === null) {
        toast.error(
          "Llegaste al límite de pestañas abiertas. Cerrá alguna antes de abrir otra.",
        );
        router.push(`/extracciones/${input.extraccionId}`);
        return;
      }
      router.push("/workspace");
    },
    [router],
  );

  const tituloDesdeResumen = useCallback(
    (perfilId: string | null | undefined): string | null => {
      if (!perfilId || !resumen) return null;
      for (const b of resumen.bancos) {
        if (b.perfiles.some((p) => p.id === perfilId)) {
          return b.entidad.nombre;
        }
      }
      return null;
    },
    [resumen],
  );

  const manejarRespuestaUpload = useCallback(
    async (res: RespuestaInicioExtraccion) => {
      if (res.deteccion?.auto && res.deteccion.mejor) {
        const tituloFallback =
          tituloDesdeResumen(res.deteccion.mejor.perfilId) ??
          res.deteccion.mejor.slug;
        toast.success(
          `Detectado: ${tituloFallback} (${(res.deteccion.mejor.score * 100).toFixed(0)}%)`,
        );
        abrirEnWorkspace({
          extraccionId: res.id,
          titulo: tituloFallback,
          perfilId: res.perfilId,
        });
        return;
      }
      if (res.deteccion && res.deteccion.candidatos.length > 0) {
        setDeteccionDudosa({
          extraccionId: res.id,
          candidatos: res.deteccion.candidatos,
        });
        return;
      }
      // Sin detector (perfil eligió manualmente o no había candidatos)
      abrirEnWorkspace({
        extraccionId: res.id,
        titulo: tituloDesdeResumen(res.perfilId) ?? "Cargando…",
        perfilId: res.perfilId,
      });
    },
    [abrirEnWorkspace, tituloDesdeResumen],
  );

  const asignarPerfilAExtraccion = useCallback(
    async (extraccionId: string, perfil: Perfil) => {
      try {
        const res = await fetch(`/api/extracciones/${extraccionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfilId: perfil.id }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { mensaje?: string }
            | null;
          throw new Error(json?.mensaje ?? `HTTP ${res.status}`);
        }
        toast.success(`Perfil asignado: ${perfil.nombre}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        toast.error(`No pude asignar el perfil: ${msg}`);
      } finally {
        setDeteccionDudosa(null);
        abrirEnWorkspace({
          extraccionId,
          titulo: tituloDesdeResumen(perfil.id) ?? perfil.nombre,
          perfilId: perfil.id,
        });
      }
    },
    [abrirEnWorkspace, tituloDesdeResumen],
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar nuevo extracto
        </h1>
        <p className="text-sm text-muted-foreground">
          Arrastrá un PDF para auto-detección, o elegí un banco/billetera de la
          lista.
        </p>
      </header>

      <BannerWorkspace />

      <DropzoneRapido onIniciar={(_, res) => manejarRespuestaUpload(res)} />

      <div className="relative">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t" />
        <div className="relative mx-auto inline-flex bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">
          o elegí el banco/billetera
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <TabsCategoriaEntidad
          activa={tab}
          onCambiar={setTab}
          conteos={conteos}
        />
        {cargando ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo…
          </div>
        ) : (
          <GridBancos
            bancos={bancosFiltrados}
            onAbrir={(b) => setBancoAbierto(b)}
            onToggleFavorito={(b) => void toggleFavorito(b)}
            mensajeVacio={
              tab === "favoritos"
                ? "Todavía no marcaste ningún banco como favorito. Tocá la estrella de una card para agregarlo."
                : tab === "tarjeta"
                  ? "No hay entidades con perfiles de tarjeta cargados todavía. Un admin puede crearlos desde /api/perfiles."
                  : "No hay entidades en esta categoría."
            }
          />
        )}
      </section>

      {resumen ? (
        <CarruselUltimosExtractos
          ultimos={resumen.ultimos}
          onAbrir={(u) =>
            abrirEnWorkspace({
              extraccionId: u.id,
              titulo:
                u.banco && u.periodo
                  ? `${u.banco} · ${u.periodo}`
                  : u.banco ?? u.perfilNombre ?? "Extracto",
              perfilId: null,
            })
          }
        />
      ) : null}

      {bancoAbierto ? (
        <PanelProducto
          banco={bancoAbierto}
          onCerrar={() => setBancoAbierto(null)}
          onToggleFavorito={() => void toggleFavorito(bancoAbierto)}
          onIniciarExtraccion={(_perfil, _archivo, res) =>
            manejarRespuestaUpload(res)
          }
        />
      ) : null}

      {deteccionDudosa && resumen ? (
        <ModalDeteccionDudosa
          candidatos={deteccionDudosa.candidatos}
          bancos={resumen.bancos}
          onElegir={(perfil) =>
            asignarPerfilAExtraccion(deteccionDudosa.extraccionId, perfil)
          }
          onSaltar={() => {
            const id = deteccionDudosa.extraccionId;
            setDeteccionDudosa(null);
            abrirEnWorkspace({
              extraccionId: id,
              titulo: "Cargando…",
              perfilId: null,
            });
          }}
          onCancelar={() => {
            const id = deteccionDudosa.extraccionId;
            setDeteccionDudosa(null);
            abrirEnWorkspace({
              extraccionId: id,
              titulo: "Cargando…",
              perfilId: null,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function BannerWorkspace() {
  const cantidad = useWorkspaceStore((s) => s.pestanas.length);
  if (cantidad === 0) return null;
  return (
    <Link
      href="/workspace"
      className="inline-flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-2 text-sm transition-colors hover:bg-muted"
    >
      <span>
        Tenés{" "}
        <strong className="font-semibold">{cantidad}</strong>{" "}
        {cantidad === 1 ? "extracto abierto" : "extractos abiertos"} en el
        workspace.
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        Ir al workspace
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
