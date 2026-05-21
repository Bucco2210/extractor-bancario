import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { conectarMongoose } from "@/lib/mongo";
import { Pago } from "@/models/Pago";
import { Usuario } from "@/models/Usuario";
import { PLANES } from "@/lib/planes";
import { RegistrarPagoManual } from "@/components/admin/RegistrarPagoManual";

export const dynamic = "force-dynamic";

export default async function AdminPagosPage() {
  const session = await auth();
  if (session?.user?.rol !== "admin") redirect("/");

  await conectarMongoose();

  const [pagos, usuarios] = await Promise.all([
    Pago.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Usuario.find({})
      .select({ email: 1, nombre: 1 })
      .sort({ email: 1 })
      .lean(),
  ]);

  const usuariosMap = new Map(
    usuarios.map((u) => [String(u._id), { email: u.email, nombre: u.nombre }]),
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al panel
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pagos</h1>
        <p className="text-sm text-muted-foreground">
          Registro manual de pagos. Cada pago confirmado extiende
          automáticamente el ciclo del plan del usuario.
        </p>
      </header>

      <RegistrarPagoManual
        usuarios={usuarios.map((u) => ({
          id: String(u._id),
          email: u.email,
          nombre: u.nombre,
        }))}
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Usuario</th>
              <th className="px-3 py-2 text-left">Plan</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2 text-left">Período</th>
              <th className="px-3 py-2 text-left">Fuente</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Todavía no hay pagos registrados.
                </td>
              </tr>
            ) : (
              pagos.map((p) => {
                const u = usuariosMap.get(String(p.usuarioId));
                const def = PLANES[p.plan as keyof typeof PLANES];
                return (
                  <tr key={String(p._id)} className="border-t">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {u?.nombre ?? "(usuario eliminado)"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {u?.email ?? String(p.usuarioId)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {def?.nombre ?? p.plan} · {p.cicloFacturacion}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.monto.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      <span className="text-xs text-muted-foreground">
                        {p.moneda}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(p.periodoInicio).toLocaleDateString("es-AR")} →{" "}
                      {new Date(p.periodoFin).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {p.fuente}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{p.estado}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {(p as { createdAt?: Date }).createdAt
                        ? new Date(
                            (p as { createdAt?: Date }).createdAt!,
                          ).toLocaleDateString("es-AR")
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
