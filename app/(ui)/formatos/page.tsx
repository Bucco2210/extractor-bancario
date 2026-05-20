import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { FormatosClient } from "@/components/formatos/FormatosClient";

export const dynamic = "force-dynamic";

export default async function FormatosPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirectTo=/formatos");
  }
  const esAdmin = session.user.rol === "admin";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Formatos aprendidos
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada formato representa una variante de PDF que el sistema ya vio.
          Configurale una regla regex para extraer determinísticamente y
          saltarse OpenAI en próximas extracciones del mismo formato.
          {!esAdmin ? " Solo lectura — necesitás rol admin para editar." : ""}
        </p>
      </header>
      <FormatosClient esAdmin={esAdmin} />
    </div>
  );
}
