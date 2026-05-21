import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Usuario } from "@/models/Usuario";
import { PLANES } from "@/lib/planes";
import { InvitarUsuario } from "@/components/admin/InvitarUsuario";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const session = await auth();
  if (session?.user?.rol !== "admin") redirect("/");

  await conectarMongoose();
  const docs = await Usuario.find({})
    .select({
      email: 1,
      nombre: 1,
      rol: 1,
      activo: 1,
      planInfo: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const items = docs.map((d) => ({
    id: String(d._id),
    email: d.email,
    nombre: d.nombre,
    rol: d.rol,
    activo: d.activo,
    plan: d.planInfo?.plan ?? null,
    estadoCuenta: d.planInfo?.estadoCuenta ?? null,
    cicloFin: d.planInfo?.cicloFin?.toISOString() ?? null,
    extraccionesEnPeriodo: d.planInfo?.extraccionesEnPeriodo ?? 0,
    conciliacionesEnPeriodo: d.planInfo?.conciliacionesEnPeriodo ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} usuario{items.length === 1 ? "" : "s"} registrado
          {items.length === 1 ? "" : "s"}.
        </p>
      </header>

      <InvitarUsuario />

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Usuario</th>
              <th className="px-3 py-2 text-left">Rol</th>
              <th className="px-3 py-2 text-left">Plan</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-right">Uso</th>
              <th className="px-3 py-2 text-left">Vence</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{u.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.email}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                    {u.rol}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {u.plan
                    ? PLANES[u.plan as keyof typeof PLANES]?.nombre ?? u.plan
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <EstadoBadge estado={u.estadoCuenta} activo={u.activo} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {u.plan ? (
                    <span>
                      {u.extraccionesEnPeriodo} ext · {u.conciliacionesEnPeriodo}{" "}
                      conc
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.cicloFin
                    ? new Date(u.cicloFin).toLocaleDateString("es-AR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EstadoBadge({
  estado,
  activo,
}: {
  estado: string | null;
  activo: boolean;
}) {
  if (!activo) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-200">
        Bloqueado
      </span>
    );
  }
  if (!estado) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
        Sin plan
      </span>
    );
  }
  const cls =
    estado === "activa"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : estado === "vencida"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {estado}
    </span>
  );
}
