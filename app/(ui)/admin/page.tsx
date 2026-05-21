import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Users,
  CreditCard,
  FileSpreadsheet,
  Layers,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Usuario } from "@/models/Usuario";
import { Extraccion } from "@/models/Extraccion";
import { Pago } from "@/models/Pago";
import { Conciliacion } from "@/models/Conciliacion";
import { PLANES } from "@/lib/planes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fechaHaceUnMes(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

export default async function AdminDashboardPage() {
  const session = await auth();
  if (session?.user?.rol !== "admin") redirect("/");

  await conectarMongoose();
  const haceUnMes = fechaHaceUnMes();

  const [
    totalUsuarios,
    usuariosPorPlan,
    usuariosPorEstado,
    totalExtracciones,
    extraccionesUltimos30,
    tokensTotal,
    pagosTotal,
    pagosUltimos30,
    totalConc,
    concUltimos30,
  ] = await Promise.all([
    Usuario.countDocuments({}),
    Usuario.aggregate([
      { $group: { _id: "$planInfo.plan", count: { $sum: 1 } } },
    ]),
    Usuario.aggregate([
      { $group: { _id: "$planInfo.estadoCuenta", count: { $sum: 1 } } },
    ]),
    Extraccion.countDocuments({}),
    Extraccion.countDocuments({ createdAt: { $gte: haceUnMes } }),
    Extraccion.aggregate([
      {
        $group: {
          _id: null,
          input: { $sum: "$_meta.tokensInput" },
          output: { $sum: "$_meta.tokensOutput" },
        },
      },
    ]),
    Pago.aggregate([
      { $match: { estado: "confirmado" } },
      {
        $group: {
          _id: "$moneda",
          total: { $sum: "$monto" },
          cantidad: { $sum: 1 },
        },
      },
    ]),
    Pago.aggregate([
      {
        $match: {
          estado: "confirmado",
          createdAt: { $gte: haceUnMes },
        },
      },
      {
        $group: {
          _id: "$moneda",
          total: { $sum: "$monto" },
          cantidad: { $sum: 1 },
        },
      },
    ]),
    Conciliacion.countDocuments({}),
    Conciliacion.countDocuments({ createdAt: { $gte: haceUnMes } }),
  ]);

  const tokensTotalNum =
    (tokensTotal[0]?.input ?? 0) + (tokensTotal[0]?.output ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Panel admin</h1>
          <p className="text-sm text-muted-foreground">
            Métricas del sitio y enlaces rápidos.
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/admin/usuarios"
            className="rounded-md border bg-white px-3 py-1.5 hover:bg-muted dark:bg-background"
          >
            Usuarios
          </Link>
          <Link
            href="/admin/pagos"
            className="rounded-md border bg-white px-3 py-1.5 hover:bg-muted dark:bg-background"
          >
            Pagos
          </Link>
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Usuarios totales"
          value={totalUsuarios}
        />
        <Kpi
          icon={<FileSpreadsheet className="h-4 w-4" />}
          label="Extracciones (total)"
          value={totalExtracciones}
          sub={`${extraccionesUltimos30} en los últimos 30 días`}
        />
        <Kpi
          icon={<Layers className="h-4 w-4" />}
          label="Conciliaciones"
          value={totalConc}
          sub={`${concUltimos30} en los últimos 30 días`}
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Tokens consumidos"
          value={tokensTotalNum.toLocaleString("es-AR")}
          sub="input + output, todo el tiempo"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Usuarios por plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(usuariosPorPlan as Array<{ _id: string | null; count: number }>)
                .sort((a, b) => b.count - a.count)
                .map((r) => (
                  <li
                    key={String(r._id)}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      {r._id && PLANES[r._id as keyof typeof PLANES]
                        ? PLANES[r._id as keyof typeof PLANES].nombre
                        : "(sin plan)"}
                    </span>
                    <span className="tabular-nums font-medium">{r.count}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Estado de cuenta
            </CardTitle>
            <CardDescription>
              Cuántos activos / vencidos / suspendidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(
                usuariosPorEstado as Array<{
                  _id: string | null;
                  count: number;
                }>
              )
                .sort((a, b) => b.count - a.count)
                .map((r) => (
                  <li
                    key={String(r._id)}
                    className="flex items-center justify-between py-2"
                  >
                    <span>{r._id ?? "(sin estado)"}</span>
                    <span className="tabular-nums font-medium">{r.count}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Ingresos confirmados
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <IngresosBlock titulo="Total histórico" data={pagosTotal} />
            <IngresosBlock titulo="Últimos 30 días" data={pagosUltimos30} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {sub ? (
          <div className="text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IngresosBlock({
  titulo,
  data,
}: {
  titulo: string;
  data: Array<{ _id: string; total: number; cantidad: number }>;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <ul className="text-sm">
        {data.map((r) => (
          <li
            key={r._id}
            className="flex items-center justify-between border-b py-1.5 last:border-0"
          >
            <span>
              {r._id}{" "}
              <span className="text-xs text-muted-foreground">
                ({r.cantidad} pagos)
              </span>
            </span>
            <span className="tabular-nums font-medium">
              {r.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
