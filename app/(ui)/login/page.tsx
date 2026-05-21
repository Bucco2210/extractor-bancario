import { redirect } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLANES, ORDEN_PLANES_VISIBLE } from "@/lib/planes";

type SearchParams = Promise<{ redirectTo?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const sp = await searchParams;
  if (session?.user) redirect(sp.redirectTo ?? "/");

  const error = sp.error ?? "";

  async function iniciarSesion(formData: FormData): Promise<void> {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const redirectTo = String(formData.get("redirectTo") ?? "/");
    try {
      await signIn("credentials", { email, password, redirectTo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("NEXT_REDIRECT")) throw err;
      redirect(
        `/login?error=credenciales&redirectTo=${encodeURIComponent(redirectTo)}`,
      );
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 py-12 lg:grid-cols-[1.4fr_1fr]">
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            <Sparkles className="h-3 w-3" />
            Importación, extracción con IA y conciliación
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-sky-800 dark:text-sky-200">
            Convertí extractos bancarios en datos en minutos.
          </h1>
          <p className="text-sm text-muted-foreground">
            Soportamos los principales bancos y billeteras de Argentina.
            Elegí el plan que mejor se ajuste a tu volumen y solicitá
            acceso — el equipo te habilita la cuenta.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {ORDEN_PLANES_VISIBLE.map((id) => {
            const def = PLANES[id];
            return (
              <Card
                key={id}
                className={
                  def.recomendado
                    ? "relative border-sky-500/60 shadow-md ring-1 ring-sky-500/40"
                    : "relative"
                }
              >
                {def.recomendado ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
                    Recomendado
                  </span>
                ) : null}
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{def.nombre}</CardTitle>
                  <CardDescription className="text-xs">
                    {def.descripcionCorta}
                  </CardDescription>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold tabular-nums">
                      ${def.precioUsd.mensual}
                    </span>
                    <span className="text-xs text-muted-foreground">USD/mes</span>
                  </div>
                  {def.precioUsd.anual ? (
                    <p className="text-[11px] text-muted-foreground">
                      o ${def.precioUsd.anual} USD/año (2 meses gratis)
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-2 pt-0">
                  <ul className="flex flex-col gap-1.5 text-xs">
                    {def.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Prueba gratuita de 3 extracciones por 10 días disponible bajo
          invitación. Escribinos al admin de tu organización para
          recibir el link.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <Card className="lg:sticky lg:top-12">
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Ingresá con tu cuenta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={iniciarSesion} className="flex flex-col gap-4">
              <input
                type="hidden"
                name="redirectTo"
                value={sp.redirectTo ?? "/"}
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">
                  Credenciales inválidas. Probá de nuevo.
                </p>
              ) : null}
              <Button type="submit" className="w-full">
                Ingresar
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          ¿Tenés un link de invitación? Ingresá directo en el link que te
          mandó tu admin (formato <code>/registro/[token]</code>).
        </p>
      </section>
    </div>
  );
}
