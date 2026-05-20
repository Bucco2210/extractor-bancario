import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConciliacionesListaClient } from "@/components/conciliacion/ConciliacionesListaClient";

export const dynamic = "force-dynamic";

export default async function ConciliacionesListaPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirectTo=/conciliacion");
  }
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Conciliaciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Cruces entre extractos extraídos y una segunda fuente (CSV o XLSX
          de cobranzas, contabilidad, etc.). Las conciliaciones se inician
          desde el detalle de cada extracto.
        </p>
      </header>
      <ConciliacionesListaClient />
    </div>
  );
}
