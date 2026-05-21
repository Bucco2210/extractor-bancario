import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Usuario } from "@/models/Usuario";
import { PLANES } from "@/lib/planes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CuentaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirectTo=/cuenta");

  await conectarMongoose();
  const u = await Usuario.findById(new Types.ObjectId(session.user.id))
    .select({ email: 1, nombre: 1, rol: 1, planInfo: 1 })
    .lean();

  if (!u) {
    return <p>No encontramos tu usuario.</p>;
  }

  const pi = u.planInfo;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tu cuenta</h1>
        <p className="text-sm text-muted-foreground">
          {u.nombre} · {u.email} ·{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
            {u.rol}
          </span>
        </p>
      </header>

      {!pi ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin plan asignado</CardTitle>
            <CardDescription>
              Tu cuenta todavía no tiene un plan. Pedile al administrador
              de tu organización que te asigne uno desde el panel admin.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <CuentaConPlan
          planInfo={{
            plan: pi.plan,
            cicloFacturacion: pi.cicloFacturacion,
            cicloInicio: pi.cicloInicio.toISOString(),
            cicloFin: pi.cicloFin.toISOString(),
            extraccionesEnPeriodo: pi.extraccionesEnPeriodo ?? 0,
            conciliacionesEnPeriodo: pi.conciliacionesEnPeriodo ?? 0,
            estadoCuenta: pi.estadoCuenta,
          }}
        />
      )}
    </div>
  );
}

function CuentaConPlan({
  planInfo,
}: {
  planInfo: {
    plan: keyof typeof PLANES;
    cicloFacturacion: string;
    cicloInicio: string;
    cicloFin: string;
    extraccionesEnPeriodo: number;
    conciliacionesEnPeriodo: number;
    estadoCuenta: string;
  };
}) {
  const def = PLANES[planInfo.plan];
  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan {def.nombre}
            {planInfo.estadoCuenta === "activa" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                Activa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" />
                {planInfo.estadoCuenta === "vencida" ? "Vencida" : "Suspendida"}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Ciclo {planInfo.cicloFacturacion}: del {fmtFecha(planInfo.cicloInicio)}
            {" "}al {fmtFecha(planInfo.cicloFin)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <BarraUso
            etiqueta="Extracciones"
            usado={planInfo.extraccionesEnPeriodo}
            limite={def.limiteExtraccionesPorCiclo}
          />
          <BarraUso
            etiqueta="Conciliaciones"
            usado={planInfo.conciliacionesEnPeriodo}
            limite={def.limiteConciliacionesPorCiclo}
          />
        </CardContent>
      </Card>

      {planInfo.estadoCuenta === "vencida" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-700 dark:text-amber-300">
              Tu cuenta está en modo lectura
            </CardTitle>
            <CardDescription>
              Podés ver y exportar a Excel todo lo que ya extrajiste, pero
              no crear nuevas extracciones ni conciliaciones hasta que
              renueves el plan. Hablá con el admin para reactivar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </>
  );
}

function BarraUso({
  etiqueta,
  usado,
  limite,
}: {
  etiqueta: string;
  usado: number;
  limite: number;
}) {
  if (limite === 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span>{etiqueta}</span>
          <span className="text-xs text-muted-foreground">No incluido</span>
        </div>
        <div className="h-2 rounded-full bg-muted" />
      </div>
    );
  }
  if (!Number.isFinite(limite)) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span>{etiqueta}</span>
          <span className="tabular-nums text-xs text-muted-foreground">
            {usado} / ∞
          </span>
        </div>
        <div className="h-2 rounded-full bg-gradient-to-r from-sky-200 via-sky-400 to-sky-600" />
      </div>
    );
  }
  const pct = Math.min(100, Math.round((usado / limite) * 100));
  const lleno = pct >= 90;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span>{etiqueta}</span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {usado} / {limite}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${
            lleno
              ? "bg-gradient-to-r from-amber-400 to-amber-600"
              : "bg-gradient-to-r from-sky-500 to-sky-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
